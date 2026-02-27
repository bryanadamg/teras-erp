'use client';

import MainLayout from './components/MainLayout';
import DashboardView from './components/DashboardView';
import LandingPage from './components/LandingPage';
import { useData } from './context/DataContext';
import { useUser } from './context/UserContext';

export default function RootPage() {
    const { currentUser } = useUser();
    
    // If not logged in, show Landing Page (MainLayout will allow this)
    if (!currentUser) {
        return (
            <MainLayout>
                <LandingPage />
            </MainLayout>
        );
    }

    // If logged in, MainLayout will redirect to /dashboard
    // But we render DashboardView here just in case of race condition or flicker
    const { 
        items, locations, stockBalance, workOrders, 
        stockEntries, samples, salesOrders, dashboardKPIs 
    } = useData();

    return (
        <MainLayout>
            <DashboardView 
                items={items} 
                locations={locations} 
                stockBalance={stockBalance} 
                workOrders={workOrders} 
                stockEntries={stockEntries} 
                samples={samples} 
                salesOrders={salesOrders} 
                kpis={dashboardKPIs} 
            />
        </MainLayout>
    );
}
