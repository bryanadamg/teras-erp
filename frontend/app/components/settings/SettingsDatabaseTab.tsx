'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../shared/Toast';
import { useTheme } from '../../context/ThemeContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useData } from '../../context/DataContext';
import { useTimezone } from '../../context/TimezoneContext';
import { xpBtn, xpInput, CodeChip, CODE_FONT } from '../shared/xpTheme';
import { xpBevel, xpTitleBar, xpSectionHead, xpTableHeader, xpThCell, tdBase } from './settingsStyles';
import ModalWrapper from '../shared/ModalWrapper';

const xpDangerBtn: React.CSSProperties = {
    fontFamily: 'Tahoma, Arial, sans-serif', fontSize: 11, padding: '3px 20px',
    cursor: 'pointer', borderRadius: 0, border: '1px solid',
    background: 'linear-gradient(to bottom, #e08080, #c03030)',
    borderColor: '#e04040 #801010 #801010 #e04040',
    color: '#fff', fontWeight: 'bold',
};

const xpCancelBtn: React.CSSProperties = {
    fontFamily: 'Tahoma, Arial, sans-serif', fontSize: 11, padding: '3px 16px',
    cursor: 'pointer', borderRadius: 0, border: '1px solid',
    borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
    background: 'linear-gradient(to bottom, #fff, #d4d0c8)', color: '#000',
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';

function prettyBytes(bytes: number | null): string {
    if (bytes == null) return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let val = bytes, i = 0;
    while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
    return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

type PingState = { ok: boolean; latency_ms: number | null } | null;

function StatusTile({ classic, label, icon, ok, detail }: { classic: boolean; label: string; icon: string; ok: boolean | null; detail: string }) {
    const color = ok === null ? '#888' : ok ? '#2e7d32' : '#c62828';
    const dotBg = ok === null ? '#aaa' : ok ? '#4caf50' : '#e53935';
    return (
        <div style={classic ? {
            flex: '1 1 150px', minWidth: 150, background: '#fff', border: '1px solid #b0a898',
            padding: '6px 8px', display: 'flex', flexDirection: 'column' as const, gap: 2,
        } : {
            flex: '1 1 150px', minWidth: 150, background: '#f8f9fa', border: '1px solid #e2e6ea',
            borderRadius: 8, padding: '8px 10px', display: 'flex', flexDirection: 'column' as const, gap: 2,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: classic ? 'Tahoma,Arial,sans-serif' : undefined, fontSize: classic ? 11 : 12, fontWeight: 'bold', color: classic ? '#333' : '#495057' }}>
                <i className={`bi ${icon}`} />
                <span>{label}</span>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotBg, marginLeft: 'auto', flexShrink: 0 }} />
            </div>
            <div style={{ fontFamily: classic ? 'Tahoma,Arial,sans-serif' : undefined, fontSize: classic ? 11 : 12, color, fontWeight: 600 }}>
                {ok === null ? 'Checking…' : ok ? 'Online' : 'Offline'}
            </div>
            <div style={{ fontFamily: classic ? 'Tahoma,Arial,sans-serif' : undefined, fontSize: classic ? 10 : 11, color: '#888' }}>{detail}</div>
        </div>
    );
}

export default function SettingsDatabaseTab() {
    const { showToast } = useToast();
    const { confirm } = useConfirm();
    const { uiStyle } = useTheme();
    const { formatDateTime: tzDateTime } = useTimezone();
    const { wsStatus } = useData();
    const classic = uiStyle === 'classic';

    const [currentDbUrl, setCurrentDbUrl] = useState('');
    const [newDbUrl, setNewDbUrl] = useState('');
    const [dbProfiles, setDbProfiles] = useState<any[]>([]);
    const [isDbLoading, setIsDbLoading] = useState(false);
    const [snapshots, setSnapshots] = useState<any[]>([]);
    const [isSnapshotLoading, setIsSnapshotLoading] = useState(false);

    const [showWipeModal, setShowWipeModal] = useState(false);
    const [wipePassword, setWipePassword] = useState('');
    const [isWiping, setIsWiping] = useState(false);

    const [beOnline, setBeOnline] = useState<boolean | null>(null);
    const [dbPing, setDbPing] = useState<PingState>(null);
    const [redisPing, setRedisPing] = useState<PingState>(null);
    const [dbSizeBytes, setDbSizeBytes] = useState<number | null>(null);
    const [statusCheckedAt, setStatusCheckedAt] = useState<Date | null>(null);
    const [isStatusLoading, setIsStatusLoading] = useState(false);

    const fetchSystemStatus = useCallback(async () => {
        setIsStatusLoading(true);
        try {
            const res = await fetch(`${API_BASE}/admin/database/status`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
            });
            setBeOnline(res.ok);
            if (res.ok) {
                const data = await res.json();
                setDbPing(data.db);
                setRedisPing(data.redis);
                setDbSizeBytes(data.db_size_bytes);
            }
        } catch (e) {
            setBeOnline(false);
        } finally {
            setStatusCheckedAt(new Date());
            setIsStatusLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSystemStatus();
        const id = setInterval(fetchSystemStatus, 30000);
        return () => clearInterval(id);
    }, [fetchSystemStatus]);

    const fetchDbInfo = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/admin/database/current`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
            });
            if (res.ok) {
                const data = await res.json();
                setCurrentDbUrl(data.data.url);
            }
        } catch (e) { console.error("DB info fetch failed", e); }
    }, []);

    const fetchSnapshots = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/admin/database/snapshots`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
            });
            if (res.ok) setSnapshots(await res.json());
        } catch (e) { console.error("Snapshot fetch failed", e); }
    }, []);

    useEffect(() => {
        fetchDbInfo();
        fetchSnapshots();
        const savedProfiles = localStorage.getItem('terras_db_profiles');
        if (savedProfiles) setDbProfiles(JSON.parse(savedProfiles));
    }, [fetchDbInfo, fetchSnapshots]);

    const handleSwitchDatabase = async (url: string) => {
        setIsDbLoading(true);
        try {
            const res = await fetch(`${API_BASE}/admin/database/switch`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
                },
                body: JSON.stringify({ name: 'Manual Switch', url })
            });
            if (res.ok) {
                showToast('Database switched and initialized!', 'success');
                if (!dbProfiles.some(p => p.url === url)) {
                    const newProfiles = [...dbProfiles, { name: `DB ${dbProfiles.length + 1}`, url }];
                    setDbProfiles(newProfiles);
                    localStorage.setItem('terras_db_profiles', JSON.stringify(newProfiles));
                }
                window.location.reload();
            } else {
                const err = await res.json();
                showToast(`Switch failed: ${err.detail}`, 'danger');
            }
        } catch (e) {
            showToast('Network error during DB switch', 'danger');
        } finally {
            setIsDbLoading(false);
        }
    };

    const handleCreateSnapshot = async () => {
        setIsSnapshotLoading(true);
        try {
            const res = await fetch(`${API_BASE}/admin/database/snapshots`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
            });
            if (res.ok) {
                showToast('Snapshot created successfully', 'success');
                fetchSnapshots();
            }
        } catch (e) { showToast('Failed to create snapshot', 'danger'); }
        finally { setIsSnapshotLoading(false); }
    };

    const handleDownloadSnapshot = async (filename: string) => {
        try {
            const res = await fetch(`${API_BASE}/admin/database/snapshots/${filename}/download`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
            });
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (e) { showToast('Download failed', 'danger'); }
    };

    const handleRestoreSnapshot = async (filename: string) => {
        const ok = await confirm({
            title: 'Restore Snapshot?',
            message: `Are you sure you want to restore "${filename}"? Current data will be overwritten.`,
            confirmText: 'Restore',
            variant: 'danger',
        });
        if (!ok) return;
        setIsSnapshotLoading(true);
        try {
            const res = await fetch(`${API_BASE}/admin/database/snapshots/${filename}/restore`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
            });
            if (res.ok) {
                showToast('Database restored successfully!', 'success');
                window.location.reload();
            } else {
                const err = await res.json();
                showToast(`Restore failed: ${err.detail}`, 'danger');
            }
        } catch (e) { showToast('Restore failed', 'danger'); }
        finally { setIsSnapshotLoading(false); }
    };

    const handleUploadSnapshot = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.[0]) return;
        const file = e.target.files[0];
        const formData = new FormData();
        formData.append('file', file);
        setIsSnapshotLoading(true);
        try {
            const res = await fetch(`${API_BASE}/admin/database/snapshots/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` },
                body: formData
            });
            if (res.ok) {
                showToast('Snapshot uploaded!', 'success');
                fetchSnapshots();
            }
        } catch (e) { showToast('Upload failed', 'danger'); }
        finally { setIsSnapshotLoading(false); }
    };

    const handleWipeDatabase = async () => {
        if (!wipePassword) return;
        setIsWiping(true);
        try {
            const res = await fetch(`${API_BASE}/admin/database/wipe`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
                },
                body: JSON.stringify({ password: wipePassword })
            });
            if (res.ok) {
                showToast('Database wiped and reset to a blank state', 'success');
                setShowWipeModal(false);
                setWipePassword('');
                window.location.reload();
            } else {
                const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
                showToast(`Wipe failed: ${err.detail}`, 'danger');
            }
        } catch (e) {
            showToast('Network error during database wipe', 'danger');
        } finally {
            setIsWiping(false);
        }
    };

    return (
        <>
            {/* System Status */}
            <div style={classic ? xpBevel : undefined} className={classic ? '' : 'card shadow-sm border-0 mb-4 border-start border-4 border-success'}>
                {classic ? (
                    <div style={xpTitleBar('linear-gradient(to right, #2e7d32 0%, #4caf50 100%)', '#1b5e20')}>
                        <span><i className="bi bi-activity" style={{ marginRight: 6 }}></i>System Status</span>
                        <button style={xpBtn()} onClick={fetchSystemStatus} disabled={isStatusLoading}>
                            {isStatusLoading ? <span className="spinner-border spinner-border-sm"></span> : <><i className="bi bi-arrow-clockwise" style={{ marginRight: 4 }}></i>Refresh</>}
                        </button>
                    </div>
                ) : (
                    <div className="card-header bg-success bg-opacity-10 text-success-emphasis d-flex justify-content-between align-items-center">
                        <h5 className="card-title mb-0"><i className="bi bi-activity me-2"></i>System Status</h5>
                        <button className="btn btn-sm btn-outline-success" onClick={fetchSystemStatus} disabled={isStatusLoading}>
                            {isStatusLoading ? <span className="spinner-border spinner-border-sm"></span> : <><i className="bi bi-arrow-clockwise me-1"></i>Refresh</>}
                        </button>
                    </div>
                )}
                <div style={classic ? { padding: '12px 14px', background: '#ece9d8' } : undefined} className={classic ? '' : 'card-body'}>
                    <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
                        <StatusTile classic={classic} label="WebSocket" icon="bi-broadcast"
                            ok={wsStatus === 'open' ? true : wsStatus === 'closed' ? false : null}
                            detail={wsStatus === 'connecting' ? 'Connecting…' : 'Live event feed'} />
                        <StatusTile classic={classic} label="Backend API" icon="bi-hdd-network"
                            ok={beOnline}
                            detail={beOnline === false ? 'Unreachable' : 'REST API'} />
                        <StatusTile classic={classic} label="Database" icon="bi-database"
                            ok={dbPing?.ok ?? (beOnline === false ? false : null)}
                            detail={dbPing?.ok ? `${dbPing.latency_ms} ms` : 'PostgreSQL'} />
                        <StatusTile classic={classic} label="Redis" icon="bi-lightning-charge"
                            ok={redisPing?.ok ?? (beOnline === false ? false : null)}
                            detail={redisPing?.ok ? `${redisPing.latency_ms} ms` : 'Event bus'} />
                        <StatusTile classic={classic} label="DB Storage" icon="bi-hdd-stack"
                            ok={dbSizeBytes != null ? true : null}
                            detail={prettyBytes(dbSizeBytes)} />
                    </div>
                    {statusCheckedAt && (
                        <div style={{ marginTop: 6, textAlign: 'right', fontFamily: classic ? 'Tahoma,Arial,sans-serif' : undefined, fontSize: 10, color: '#999' }}>
                            Last checked {statusCheckedAt.toLocaleTimeString()}
                        </div>
                    )}
                </div>
            </div>

            {/* Database Infrastructure */}
            <div style={classic ? xpBevel : undefined} className={classic ? '' : 'card shadow-sm border-0 mb-4 border-start border-4 border-info'}>
                {classic ? (
                    <div style={xpTitleBar('linear-gradient(to right, #006e8e 0%, #00a8c8 100%)', '#004a5e')}>
                        <span><i className="bi bi-database-fill-gear" style={{ marginRight: 6 }}></i>Database Infrastructure</span>
                        <span style={{ background: '#004a5e', border: '1px solid #003040', color: '#aaeeff', padding: '1px 6px', fontSize: '9px', fontFamily: 'Tahoma,Arial,sans-serif', fontWeight: 'bold' }}>Admin Only</span>
                    </div>
                ) : (
                    <div className="card-header bg-info bg-opacity-10 text-info-emphasis d-flex justify-content-between align-items-center">
                        <h5 className="card-title mb-0" data-testid="db-infrastructure-header"><i className="bi bi-database-fill-gear me-2"></i>Database Infrastructure</h5>
                        <span className="badge bg-info">Admin Only</span>
                    </div>
                )}
                <div style={classic ? { padding: '12px 14px', background: '#ece9d8' } : undefined} className={classic ? '' : 'card-body'}>
                    <div className="mb-3">
                        <label
                            style={classic ? { fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '11px', color: '#000', display: 'block', marginBottom: 2, fontWeight: 'bold', textTransform: 'uppercase' as const, letterSpacing: '0.5px' } : undefined}
                            className={classic ? '' : 'form-label small fw-bold text-muted'}
                        >Current Connection</label>
                        {classic ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ background: '#e0dfd8', border: '1px solid #b0a898', padding: '1px 6px', fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '11px', color: '#333' }}>
                                    <i className="bi bi-link-45deg"></i>
                                </span>
                                <input style={xpInput({ flex: 1, background: '#f0ede6', boxShadow: 'inset 1px 1px 0 rgba(0,0,0,0.1)' })} value={currentDbUrl} readOnly />
                            </div>
                        ) : (
                            <div className="input-group">
                                <span className="input-group-text bg-light"><i className="bi bi-link-45deg"></i></span>
                                <input className="form-control bg-light small" style={{ fontFamily: CODE_FONT }} value={currentDbUrl} readOnly />
                            </div>
                        )}
                    </div>

                    <div className="row g-4">
                        <div className="col-md-7">
                            <div style={classic ? xpSectionHead : undefined}>
                                {classic ? 'Switch to New Database' : <label className="form-label small fw-bold text-primary">Switch to New Database</label>}
                            </div>
                            {classic ? (
                                <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                                    <input
                                        style={xpInput({ flex: 1, fontFamily: CODE_FONT, boxShadow: 'inset 1px 1px 0 rgba(0,0,0,0.1)' })}
                                        placeholder="postgresql+psycopg2://user:pass@host:port/db"
                                        value={newDbUrl}
                                        onChange={e => setNewDbUrl(e.target.value)}
                                    />
                                    <button
                                        style={xpBtn({ background: 'linear-gradient(to bottom, #006e8e, #004a5e)', borderColor: '#004a5e #001a2e #001a2e #004a5e', color: '#ffffff' })}
                                        onClick={() => handleSwitchDatabase(newDbUrl)}
                                        disabled={!newDbUrl || isDbLoading}
                                    >
                                        {isDbLoading ? <span className="spinner-border spinner-border-sm"></span> : 'Switch Connection'}
                                    </button>
                                </div>
                            ) : (
                                <div className="input-group mb-2">
                                    <input
                                        className="form-control small"
                                        style={{ fontFamily: CODE_FONT }}
                                        placeholder="postgresql+psycopg2://user:pass@host:port/db"
                                        value={newDbUrl}
                                        onChange={e => setNewDbUrl(e.target.value)}
                                    />
                                    <button
                                        className="btn btn-info text-white"
                                        onClick={() => handleSwitchDatabase(newDbUrl)}
                                        disabled={!newDbUrl || isDbLoading}
                                    >
                                        {isDbLoading ? <span className="spinner-border spinner-border-sm"></span> : 'Switch Connection'}
                                    </button>
                                </div>
                            )}
                            <div
                                style={classic ? { fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '10px', color: '#8b0000', marginTop: 2 } : undefined}
                                className={classic ? '' : 'form-text extra-small text-danger'}
                            >
                                <i className="bi bi-exclamation-triangle-fill" style={{ marginRight: 4 }}></i>
                                WARNING: Switching databases will change the entire data context.
                            </div>
                        </div>
                        <div className="col-md-5">
                            <div style={classic ? xpSectionHead : undefined}>
                                {classic ? 'Saved Profiles' : <label className="form-label small fw-bold text-muted">Saved Profiles</label>}
                            </div>
                            {classic ? (
                                <div style={{ border: '1px solid #b0a898', background: '#ffffff', maxHeight: 120, overflowY: 'auto' as const }}>
                                    {dbProfiles.map((p, i) => (
                                        <button
                                            key={i}
                                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '3px 8px', background: 'none', border: 'none', borderBottom: '1px solid #e0dfd8', cursor: 'pointer', fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '11px', textAlign: 'left' as const }}
                                            onClick={() => setNewDbUrl(p.url)}
                                        >
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, maxWidth: '90%' }}>{p.name}: {p.url}</span>
                                            <i className="bi bi-arrow-right-short"></i>
                                        </button>
                                    ))}
                                    {dbProfiles.length === 0 && (
                                        <div style={{ padding: '8px', textAlign: 'center', fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '10px', color: '#888', fontStyle: 'italic' }}>No saved profiles</div>
                                    )}
                                </div>
                            ) : (
                                <div className="list-group list-group-flush border rounded overflow-auto" style={{maxHeight: '120px'}}>
                                    {dbProfiles.map((p, i) => (
                                        <button
                                            key={i}
                                            className="list-group-item list-group-item-action d-flex justify-content-between align-items-center small"
                                            onClick={() => setNewDbUrl(p.url)}
                                        >
                                            <span className="text-truncate" style={{maxWidth: '80%'}}>{p.name}: {p.url}</span>
                                            <i className="bi bi-arrow-right-short"></i>
                                        </button>
                                    ))}
                                    {dbProfiles.length === 0 && <div className="p-3 text-center text-muted extra-small">No saved profiles</div>}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Snapshot & Context Migration */}
            <div style={classic ? xpBevel : undefined} className={classic ? '' : 'card shadow-sm border-0 mb-4 border-start border-4 border-primary'}>
                {classic ? (
                    <div style={xpTitleBar()}>
                        <span><i className="bi bi-camera-fill" style={{ marginRight: 6 }}></i>Snapshot &amp; Context Migration</span>
                        <div style={{ display: 'flex', gap: 4 }}>
                            <label style={xpBtn()}>
                                <i className="bi bi-cloud-upload" style={{ marginRight: 4 }}></i>Upload Snapshot
                                <input type="file" hidden onChange={handleUploadSnapshot} disabled={isSnapshotLoading} />
                            </label>
                            <button
                                style={xpBtn({ background: 'linear-gradient(to bottom, #316ac5, #1a4a8a)', borderColor: '#1a3a7a #0a1a4a #0a1a4a #1a3a7a', color: '#ffffff' })}
                                onClick={handleCreateSnapshot}
                                disabled={isSnapshotLoading}
                            >
                                {isSnapshotLoading ? <span className="spinner-border spinner-border-sm" style={{ marginRight: 4 }}></span> : <i className="bi bi-plus-lg" style={{ marginRight: 4 }}></i>}
                                Create New Snapshot
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="card-header bg-primary bg-opacity-10 text-primary-emphasis d-flex justify-content-between align-items-center">
                        <h5 className="card-title mb-0"><i className="bi bi-camera-fill me-2"></i>Snapshot &amp; Context Migration</h5>
                        <div className="d-flex gap-2">
                            <label className="btn btn-sm btn-outline-primary mb-0" style={{cursor: 'pointer'}}>
                                <i className="bi bi-cloud-upload me-1"></i>Upload Snapshot
                                <input type="file" hidden onChange={handleUploadSnapshot} disabled={isSnapshotLoading} />
                            </label>
                            <button className="btn btn-primary btn-sm" onClick={handleCreateSnapshot} disabled={isSnapshotLoading}>
                                {isSnapshotLoading ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-plus-lg me-1"></i>}
                                Create New Snapshot
                            </button>
                        </div>
                    </div>
                )}
                <div style={classic ? { background: '#ece9d8' } : undefined} className={classic ? '' : 'card-body p-0'}>
                    <div className="table-responsive">
                        <table
                            style={classic ? { width: '100%', borderCollapse: 'collapse' as const, background: '#fff' } : undefined}
                            className={classic ? '' : 'table table-hover align-middle mb-0 small'}
                        >
                            <thead style={classic ? xpTableHeader : undefined} className={classic ? '' : 'table-light'}>
                                <tr>
                                    <th style={classic ? { ...xpThCell } : undefined} className={classic ? '' : 'ps-4'}>Snapshot Filename</th>
                                    <th style={classic ? xpThCell : undefined}>Created At</th>
                                    <th style={classic ? xpThCell : undefined}>Size</th>
                                    <th style={classic ? { ...xpThCell, textAlign: 'right' as const, borderRight: 'none' } : undefined} className={classic ? '' : 'text-end pe-4'}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {snapshots.map((s, i) => (
                                    <tr
                                        key={i}
                                        style={classic ? { background: i % 2 === 0 ? '#ffffff' : '#f5f3ee', borderBottom: '1px solid #c0bdb5' } : undefined}
                                    >
                                        <td style={classic ? tdBase : undefined} className={classic ? '' : 'ps-4'}><CodeChip code={s.name} classic={classic} /></td>
                                        <td style={classic ? tdBase : undefined}>{tzDateTime(s.created_at)}</td>
                                        <td style={classic ? tdBase : undefined}>{(s.size / 1024 / 1024).toFixed(2)} MB</td>
                                        <td style={classic ? { ...tdBase, borderRight: 'none', textAlign: 'right' as const } : undefined} className={classic ? '' : 'text-end pe-4'}>
                                            <div style={classic ? { display: 'flex', gap: 4, justifyContent: 'flex-end' } : undefined} className={classic ? '' : 'd-flex gap-2 justify-content-end'}>
                                                {classic ? (
                                                    <>
                                                        <button
                                                            title="Export/Download"
                                                            onClick={() => handleDownloadSnapshot(s.name)}
                                                            style={{ background: 'none', border: '1px solid transparent', borderRadius: 2, cursor: 'pointer', padding: '1px 4px', color: '#0058e6', fontSize: '14px' }}
                                                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#7f9db9'; (e.currentTarget as HTMLButtonElement).style.background = '#e8f0f8'; }}
                                                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                                                        ><i className="bi bi-download"></i></button>
                                                        <button
                                                            title="Restore/Rollback"
                                                            onClick={() => handleRestoreSnapshot(s.name)}
                                                            style={{ background: 'none', border: '1px solid transparent', borderRadius: 2, cursor: 'pointer', padding: '1px 4px', color: '#2e7d32', fontSize: '14px' }}
                                                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#4caf50'; (e.currentTarget as HTMLButtonElement).style.background = '#e8f5e9'; }}
                                                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                                                        ><i className="bi bi-arrow-counterclockwise"></i></button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button className="btn btn-sm btn-link text-primary p-0" onClick={() => handleDownloadSnapshot(s.name)} title="Export/Download">
                                                            <i className="bi bi-download fs-5"></i>
                                                        </button>
                                                        <button className="btn btn-sm btn-link text-success p-0" onClick={() => handleRestoreSnapshot(s.name)} title="Restore/Rollback">
                                                            <i className="bi bi-arrow-counterclockwise fs-5"></i>
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {snapshots.length === 0 && (
                                    <tr>
                                        <td
                                            colSpan={4}
                                            style={classic ? { ...tdBase, borderRight: 'none', textAlign: 'center', padding: '20px 8px', color: '#888', fontStyle: 'italic' } : undefined}
                                            className={classic ? '' : 'text-center py-4 text-muted'}
                                        >No snapshots found. Create one to begin.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Danger Zone */}
            <div style={classic ? xpBevel : undefined} className={classic ? '' : 'card shadow-sm border-0 mb-4 border-start border-4 border-danger'}>
                {classic ? (
                    <div style={xpTitleBar('linear-gradient(to right, #d32f2f 0%, #8b0000 100%)', '#4a0000')}>
                        <span><i className="bi bi-exclamation-octagon-fill" style={{ marginRight: 6 }}></i>Danger Zone</span>
                    </div>
                ) : (
                    <div className="card-header bg-danger bg-opacity-10 text-danger-emphasis">
                        <h5 className="card-title mb-0"><i className="bi bi-exclamation-octagon-fill me-2"></i>Danger Zone</h5>
                    </div>
                )}
                <div style={classic ? { padding: '12px 14px', background: '#ece9d8' } : undefined} className={classic ? '' : 'card-body'}>
                    <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                        <div>
                            <div style={classic ? { fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 12, fontWeight: 'bold', color: '#333' } : undefined} className={classic ? '' : 'fw-bold'}>
                                Wipe &amp; Reset Database
                            </div>
                            <div style={classic ? { fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 10, color: '#8b0000', marginTop: 2 } : undefined} className={classic ? '' : 'form-text extra-small text-danger'}>
                                <i className="bi bi-exclamation-triangle-fill" style={{ marginRight: 4 }}></i>
                                Permanently deletes every row in the current database, then rebuilds it blank (migrations + seed data). Use this before importing a snapshot from another environment. Cannot be undone.
                            </div>
                        </div>
                        {classic ? (
                            <button
                                style={xpBtn({ background: 'linear-gradient(to bottom, #d32f2f, #8b0000)', borderColor: '#7f0000 #4a0000 #4a0000 #7f0000', color: '#ffffff' })}
                                onClick={() => setShowWipeModal(true)}
                            >
                                <i className="bi bi-trash3-fill" style={{ marginRight: 4 }}></i>Wipe Database
                            </button>
                        ) : (
                            <button className="btn btn-danger btn-sm" onClick={() => setShowWipeModal(true)}>
                                <i className="bi bi-trash3-fill me-1"></i>Wipe Database
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <ModalWrapper
                isOpen={showWipeModal}
                onClose={() => { if (!isWiping) { setShowWipeModal(false); setWipePassword(''); } }}
                title={<><i className="bi bi-exclamation-octagon-fill me-1"></i>Confirm Database Wipe</>}
                variant="danger"
                size="sm"
                modeless
                footer={
                    <>
                        {classic ? (
                            <button type="button" style={xpCancelBtn} onClick={() => { setShowWipeModal(false); setWipePassword(''); }} disabled={isWiping}>Cancel</button>
                        ) : (
                            <button type="button" className="btn btn-sm btn-link text-muted text-decoration-none" onClick={() => { setShowWipeModal(false); setWipePassword(''); }} disabled={isWiping}>Cancel</button>
                        )}
                        {classic ? (
                            <button type="button" style={xpDangerBtn} onClick={handleWipeDatabase} disabled={!wipePassword || isWiping}>
                                {isWiping ? <span className="spinner-border spinner-border-sm"></span> : 'WIPE DATABASE'}
                            </button>
                        ) : (
                            <button type="button" className="btn btn-sm btn-danger px-4 fw-bold shadow-sm" onClick={handleWipeDatabase} disabled={!wipePassword || isWiping}>
                                {isWiping ? <span className="spinner-border spinner-border-sm me-1"></span> : null}
                                WIPE DATABASE
                            </button>
                        )}
                    </>
                }
            >
                <p className={classic ? '' : 'small'} style={classic ? { fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, color: '#333' } : undefined}>
                    This will <strong>permanently delete every row</strong> in the current database and rebuild it blank. Enter your password to confirm.
                </p>
                <label
                    style={classic ? { fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, display: 'block', marginBottom: 2, fontWeight: 'bold' } : undefined}
                    className={classic ? '' : 'form-label small fw-bold'}
                >Password</label>
                {classic ? (
                    <input
                        type="password"
                        style={xpInput({ width: '100%', boxShadow: 'inset 1px 1px 0 rgba(0,0,0,0.1)' })}
                        value={wipePassword}
                        onChange={e => setWipePassword(e.target.value)}
                        disabled={isWiping}
                        autoFocus
                    />
                ) : (
                    <input
                        type="password"
                        className="form-control"
                        value={wipePassword}
                        onChange={e => setWipePassword(e.target.value)}
                        disabled={isWiping}
                        autoFocus
                    />
                )}
            </ModalWrapper>
        </>
    );
}
