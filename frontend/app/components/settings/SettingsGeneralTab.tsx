'use client';

import { useState } from 'react';
import { useToast } from '../shared/Toast';
import { useTheme, UI_SCALES } from '../../context/ThemeContext';
import { useTimezone, AVAILABLE_TIMEZONES } from '../../context/TimezoneContext';
import { useUser } from '../../context/UserContext';
import { xpBtn, xpInput, FieldLabel, BTN_TONES, XP_BTN } from '../shared/xpTheme';
import { settingsActions, settingsGrid, settingsHint, settingsStack } from './settingsStyles';
import SettingsPanel from './SettingsPanel';
import CompanyProfileView from './CompanyProfileView';

export default function SettingsGeneralTab({
    appName, onUpdateAppName, uiStyle, onUpdateUIStyle,
    companyProfile, onUpdateCompanyProfile, onUploadLogo,
}: any) {
    const { showToast } = useToast();
    const { hasPermission } = useUser();
    const isAdmin = hasPermission('admin.access');
    const { uiStyle: currentStyle, uiScale, setUiScale } = useTheme();
    const { timezone, setTimezone } = useTimezone();
    const classic = currentStyle === 'classic';

    const [name, setName] = useState(appName);
    const [style, setStyle] = useState(uiStyle || currentStyle || 'classic');
    const [tz, setTz] = useState(timezone);
    const [scale, setScale] = useState(uiScale);

    const handleSubmitSystem = (e: React.FormEvent) => {
        e.preventDefault();
        if (onUpdateAppName && isAdmin) onUpdateAppName(name);
        if (onUpdateUIStyle) onUpdateUIStyle(style);
        setTimezone(tz);
        setUiScale(scale);
        showToast('System preferences updated!', 'success');
    };

    return (
        <div style={settingsStack}>
            <SettingsPanel classic={classic} icon="bi-gear-fill" title="System Preferences">
                <form onSubmit={handleSubmitSystem}>
                    <div style={settingsGrid()}>
                        <div>
                            <FieldLabel classic={classic}>Application Name</FieldLabel>
                            <input
                                style={classic ? xpInput({ width: '100%' }) : undefined}
                                className={classic ? '' : 'form-control form-control-sm'}
                                value={name}
                                onChange={e => setName(e.target.value)}
                                disabled={!isAdmin}
                            />
                            {!isAdmin && (
                                <div style={settingsHint(classic)}>Only admins can change the application name.</div>
                            )}
                        </div>
                        <div>
                            <FieldLabel classic={classic}>Interface Style</FieldLabel>
                            <select
                                style={classic ? xpInput({ height: 'auto', padding: '2px 4px', width: '100%' }) : undefined}
                                className={classic ? '' : 'form-select form-select-sm'}
                                value={style}
                                onChange={e => setStyle(e.target.value)}
                            >
                                <option value="classic">Classic (Windows XP)</option>
                                <option value="modern">Modern (Clean)</option>
                            </select>
                        </div>
                        <div>
                            <FieldLabel classic={classic}>Interface Scale</FieldLabel>
                            <select
                                style={classic ? xpInput({ height: 'auto', padding: '2px 4px', width: '100%' }) : undefined}
                                className={classic ? '' : 'form-select form-select-sm'}
                                value={scale}
                                onChange={e => setScale(Number(e.target.value))}
                            >
                                {UI_SCALES.map(s => (
                                    <option key={s} value={s}>
                                        {s}%{s === 80 ? ' (Default)' : ''}
                                    </option>
                                ))}
                            </select>
                            <div style={settingsHint(classic)}>
                                Fits more rows on screen without browser zoom. Applies on this
                                device; phones and printouts always render at 100%.
                            </div>
                        </div>
                        <div>
                            <FieldLabel classic={classic}>Display Timezone</FieldLabel>
                            <select
                                style={classic ? xpInput({ height: 'auto', padding: '2px 4px', width: '100%' }) : undefined}
                                className={classic ? '' : 'form-select form-select-sm'}
                                value={tz}
                                onChange={e => setTz(e.target.value)}
                            >
                                {AVAILABLE_TIMEZONES.map(z => (
                                    <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>
                                ))}
                            </select>
                            <div style={settingsHint(classic)}>
                                Dates &amp; times (e.g. stock ledger) display in this zone on this device.
                            </div>
                        </div>
                    </div>
                    <div style={settingsActions(classic)}>
                        <button
                            type="submit"
                            style={classic ? xpBtn({ ...BTN_TONES.primary, padding: '3px 14px', display: 'flex', alignItems: 'center', gap: 4 }) : undefined}
                            className={classic ? XP_BTN : 'btn btn-sm btn-primary px-3'}
                        >
                            <i className="bi bi-save" style={classic ? { marginRight: 4 } : { marginRight: 4 }}></i>
                            Save Preferences
                        </button>
                    </div>
                </form>
            </SettingsPanel>

            {/* Company Profile (Admin Only) */}
            {hasPermission('admin.access') && (
                <CompanyProfileView
                    profile={companyProfile}
                    onUpdate={onUpdateCompanyProfile}
                    onUploadLogo={onUploadLogo}
                />
            )}
        </div>
    );
}
