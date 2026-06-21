'use client';

import DashboardView from '../components/dashboard/DashboardView';
import MobileDashboardView from '../components/mobile/DashboardView';
import { useData } from '../context/DataContext';
import { useIsMobile } from '../hooks/useIsMobile';

export default function DashboardPage() {
    const {
        items, locations, locationCategories, stockBalance, manufacturingOrders,
        stockEntries, samples, salesOrders, dashboardKPIs,
        dashboardSummary, itemIndex,
    } = useData();
    const isMobile = useIsMobile();

    if (isMobile) {
        return (
            <MobileDashboardView
                items={items}
                stockBalance={stockBalance}
                workOrders={manufacturingOrders}
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
                locationCategories={locationCategories}
                stockBalance={stockBalance}
                workOrders={manufacturingOrders}
                stockEntries={stockEntries}
                samples={samples}
                salesOrders={salesOrders}
                kpis={dashboardKPIs}
                summary={dashboardSummary}
                itemIndex={itemIndex}
            />
    );
}
