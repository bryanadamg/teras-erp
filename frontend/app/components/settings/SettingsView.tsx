'use client';

import { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useUser } from '../../context/UserContext';
import { Tabs, TabDef } from '../shared/Tabs';
import SettingsGeneralTab from './SettingsGeneralTab';
import SettingsAccountTab from './SettingsAccountTab';
import SettingsDatabaseTab from './SettingsDatabaseTab';
import SettingsUsersTab from './SettingsUsersTab';

type TabKey = 'general' | 'account' | 'database' | 'users';

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
            { key: 'users' as TabKey, label: 'User Management', icon: 'bi-shield-lock' },
        ] : []),
    ];

    return (
        <div className="row justify-content-center fade-in">
            <div className="col-md-10">
                <Tabs tabs={tabs} activeKey={activeTab} onChange={(key) => setActiveTab(key)} classic={classic} />

                <div style={{ marginTop: 16 }}>
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

                            <div style={{ display: activeTab === 'users' ? 'block' : 'none' }}>
                                <SettingsUsersTab />
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
