'use client';

import DashboardView from './components/dashboard/DashboardView';
import MobileDashboardView from './components/mobile/DashboardView';
import { useData } from './context/DataContext';
import { useIsMobile } from './hooks/useIsMobile';

export default function RootPage() {
    const {
        items, locations, stockBalance, dashboardWorkOrders,
        stockEntries, samples, salesOrders, dashboardKPIs,
        dashboardSummary, dashboardKpiHistory, itemIndex,
    } = useData();
    const isMobile = useIsMobile();

    if (isMobile) {
        return (
            <MobileDashboardView
                items={items}
                stockBalance={stockBalance}
                workOrders={dashboardWorkOrders}
                salesOrders={salesOrders}
                kpis={dashboardKPIs}
                summary={dashboardSummary}
                itemIndex={itemIndex}
            />
        );
    }

    return (
            <DashboardView
                items={items}
                locations={locations}
                stockBalance={stockBalance}
                workOrders={dashboardWorkOrders}
                stockEntries={stockEntries}
                samples={samples}
                salesOrders={salesOrders}
                kpis={dashboardKPIs}
                summary={dashboardSummary}
                itemIndex={itemIndex}
                kpiHistory={dashboardKpiHistory}
            />
    );
}
