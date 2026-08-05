'use client';

import { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useUser } from '../../context/UserContext';
import { Tabs, TabDef } from '../shared/Tabs';
import { xpFont } from '../shared/xpTheme';
import { xpBevel as sharedXpBevel } from '../shared/shellTheme';
import SettingsGeneralTab from './SettingsGeneralTab';
import SettingsAccountTab from './SettingsAccountTab';
import SettingsDatabaseTab from './SettingsDatabaseTab';
import SettingsAccessTab from './SettingsAccessTab';

type TabKey = 'general' | 'account' | 'database' | 'access';

const modernFont = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export default function SettingsView({
    appName, onUpdateAppName, uiStyle, onUpdateUIStyle,
    companyProfile, onUpdateCompanyProfile, onUploadLogo,
}: any) {
    const { uiStyle: currentStyle } = useTheme();
    const classic = currentStyle === 'classic';
    const { hasPermission } = useUser();
    const isAdmin = hasPermission('admin.access');

    const [activeTab, setActiveTab] = useState<TabKey>('general');

    const tabs: TabDef<TabKey>[] = [
        { key: 'general', label: 'General', icon: 'bi-gear-fill' },
        { key: 'account', label: 'My Account', icon: 'bi-person-fill' },
        ...(isAdmin ? [
            { key: 'database' as TabKey, label: 'Database & Backups', icon: 'bi-database-fill-gear' },
            { key: 'access' as TabKey, label: 'Access Control', icon: 'bi-shield-lock' },
        ] : []),
    ];

    return (
        <div className="fade-in">
            {/* Outer shell — XP bevel in classic, rounded card in modern (same chrome as DyeingSettingView) — full width like other section pages */}
            <div style={classic ? sharedXpBevel() : {
                fontFamily: modernFont,
                border: '1px solid #dbe1ea',
                borderRadius: 9,
                background: '#fff',
                overflow: 'hidden',
                boxShadow: '0 1px 2px rgba(15,23,42,0.06)',
            }}>
                {/* Title bar */}
                <div style={classic ? {
                    background: 'linear-gradient(to right, #0058e6 0%, #08a5ff 100%)',
                    color: 'white',
                    padding: '6px 12px',
                    fontFamily: xpFont,
                    fontSize: 13,
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                } : {
                    background: '#f7f9fc',
                    color: '#1e293b',
                    padding: '11px 14px',
                    fontFamily: modernFont,
                    fontSize: 14,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    borderBottom: '1px solid #dbe1ea',
                }}>
                    <i className="bi bi-sliders" style={{ fontSize: 14, color: classic ? undefined : '#2563eb' }} />
                    Settings
                </div>

                {/* Tabs bar */}
                <Tabs tabs={tabs} activeKey={activeTab} onChange={(key) => setActiveTab(key)} classic={classic} />

                {/* Content area */}
                <div style={{
                    padding: 16,
                    background: classic ? '#ece9d8' : '#f7f9fc',
                }}>
                    <div style={{ display: activeTab === 'general' ? 'block' : 'none' }}>
                        <SettingsGeneralTab
                            appName={appName}
                            onUpdateAppName={onUpdateAppName}
                            uiStyle={uiStyle}
                            onUpdateUIStyle={onUpdateUIStyle}
                            companyProfile={companyProfile}
                            onUpdateCompanyProfile={onUpdateCompanyProfile}
                            onUploadLogo={onUploadLogo}
                        />
                    </div>

                    <div style={{ display: activeTab === 'account' ? 'block' : 'none' }}>
                        <SettingsAccountTab />
                    </div>

                    {isAdmin && (
                        <>
                            <div style={{ display: activeTab === 'database' ? 'block' : 'none' }}>
                                <SettingsDatabaseTab />
                            </div>

                            <div style={{ display: activeTab === 'access' ? 'block' : 'none' }}>
                                <SettingsAccessTab />
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
