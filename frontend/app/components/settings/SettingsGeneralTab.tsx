'use client';

import { useState } from 'react';
import { useToast } from '../shared/Toast';
import { useTheme } from '../../context/ThemeContext';
import { useTimezone, AVAILABLE_TIMEZONES } from '../../context/TimezoneContext';
import { useUser } from '../../context/UserContext';
import { xpBtn, xpInput, xpLabel } from '../shared/xpTheme';
import { xpBevel, xpTitleBar } from './settingsStyles';
import CompanyProfileView from './CompanyProfileView';

export default function SettingsGeneralTab({
    appName, onUpdateAppName, uiStyle, onUpdateUIStyle,
    companyProfile, onUpdateCompanyProfile, onUploadLogo,
}: any) {
    const { showToast } = useToast();
    const { hasPermission } = useUser();
    const { uiStyle: currentStyle } = useTheme();
    const { timezone, setTimezone } = useTimezone();
    const classic = currentStyle === 'classic';

    const [name, setName] = useState(appName);
    const [style, setStyle] = useState(uiStyle || currentStyle || 'classic');
    const [tz, setTz] = useState(timezone);

    const handleSubmitSystem = (e: React.FormEvent) => {
        e.preventDefault();
        if (onUpdateAppName) onUpdateAppName(name);
        if (onUpdateUIStyle) onUpdateUIStyle(style);
        setTimezone(tz);
        showToast('System preferences updated!', 'success');
    };

    return (
        <>
            {/* System Preferences */}
            <div style={classic ? xpBevel : undefined} className={classic ? '' : 'card shadow-sm border-0 mb-4'}>
                {classic ? (
                    <div style={xpTitleBar()}>
                        <span><i className="bi bi-gear-fill" style={{ marginRight: 6 }}></i>System Preferences</span>
                    </div>
                ) : (
                    <div className="card-header bg-white">
                        <h5 className="card-title mb-0">System Preferences</h5>
                    </div>
                )}
                <div style={classic ? { padding: '12px 14px', background: '#ece9d8' } : undefined} className={classic ? '' : 'card-body'}>
                    <form onSubmit={handleSubmitSystem}>
                        <div className="row">
                            <div className="col-md-6 mb-3">
                                <label
                                    style={classic ? xpLabel() : undefined}
                                    className={classic ? '' : 'form-label'}
                                >Application Name</label>
                                <input
                                    style={classic ? xpInput({ width: '100%' }) : undefined}
                                    className={classic ? '' : 'form-control'}
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                />
                            </div>
                            <div className="col-md-6 mb-3">
                                <label
                                    style={classic ? xpLabel() : undefined}
                                    className={classic ? '' : 'form-label'}
                                >Interface Style</label>
                                <select
                                    style={classic ? xpInput({ height: 'auto', padding: '2px 4px', width: '100%' }) : undefined}
                                    className={classic ? '' : 'form-select'}
                                    value={style}
                                    onChange={e => setStyle(e.target.value)}
                                >
                                    <option value="classic">Classic (Windows XP)</option>
                                    <option value="modern">Modern (Clean)</option>
                                </select>
                            </div>
                            <div className="col-md-6 mb-3">
                                <label
                                    style={classic ? xpLabel() : undefined}
                                    className={classic ? '' : 'form-label'}
                                >Display Timezone</label>
                                <select
                                    style={classic ? xpInput({ height: 'auto', padding: '2px 4px', width: '100%' }) : undefined}
                                    className={classic ? '' : 'form-select'}
                                    value={tz}
                                    onChange={e => setTz(e.target.value)}
                                >
                                    {AVAILABLE_TIMEZONES.map(z => (
                                        <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>
                                    ))}
                                </select>
                                <small className={classic ? '' : 'text-muted'} style={classic ? { fontSize: 10, color: '#555' } : undefined}>
                                    Dates &amp; times (e.g. stock ledger) display in this zone on this device.
                                </small>
                            </div>
                        </div>
                        <button
                            type="submit"
                            style={classic ? xpBtn({ background: 'linear-gradient(to bottom, #316ac5, #1a4a8a)', borderColor: '#1a3a7a #0a1a4a #0a1a4a #1a3a7a', color: '#ffffff', fontWeight: 'bold', width: '100%', padding: '4px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }) : undefined}
                            className={classic ? '' : 'btn btn-primary w-100'}
                        >
                            <i className="bi bi-save" style={classic ? { marginRight: 4 } : undefined}></i>
                            Save Preferences
                        </button>
                    </form>
                </div>
            </div>

            {/* Company Profile (Admin Only) */}
            {hasPermission('admin.access') && (
                <CompanyProfileView
                    profile={companyProfile}
                    onUpdate={onUpdateCompanyProfile}
                    onUploadLogo={onUploadLogo}
                />
            )}
        </>
    );
}
