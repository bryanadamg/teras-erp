'use client';

import { useState, useEffect } from 'react';
import MainLayout from '../components/MainLayout';
import SettingsView from '../components/SettingsView';
import { useData } from '../context/DataContext';

export default function SettingsPage() {
    const { fetchData } = useData();
    const [appName, setAppName] = useState('Terras ERP');
    const [uiStyle, setUiStyle] = useState('classic');

    useEffect(() => {
        const savedName = localStorage.getItem('app_name'); if (savedName) setAppName(savedName);
        const savedStyle = localStorage.getItem('ui_style'); if (savedStyle) setUiStyle(savedStyle);
    }, []);

    const handleUpdateAppName = (name: string) => {
        setAppName(name);
        localStorage.setItem('app_name', name);
    };

    const handleUpdateUIStyle = (style: string) => {
        setUiStyle(style);
        localStorage.setItem('ui_style', style);
        window.location.reload(); // Apply globally
    };

    return (
        <MainLayout>
            <SettingsView 
                appName={appName} 
                onUpdateAppName={handleUpdateAppName} 
                uiStyle={uiStyle} 
                onUpdateUIStyle={handleUpdateUIStyle} 
                onClearCache={() => { localStorage.removeItem('terras_master_cache'); fetchData(); }} 
            />
        </MainLayout>
    );
}
