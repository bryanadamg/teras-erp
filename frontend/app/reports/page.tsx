'use client';

import MainLayout from '../components/MainLayout';
import ReportsView from '../components/ReportsView';
import { useData } from '../context/DataContext';

export default function ReportsPage() {
    const { stockEntries, items, locations, categories, pagination, fetchData } = useData();

    return (
        <MainLayout>
            <ReportsView 
                stockEntries={stockEntries} 
                items={items} 
                locations={locations} 
                categories={categories} 
                currentPage={pagination.reportPage} 
                totalItems={pagination.reportTotal} 
                pageSize={pagination.pageSize} 
                onPageChange={pagination.setReportPage}
                onRefresh={fetchData}
            />
        </MainLayout>
    );
}
