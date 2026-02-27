'use client';

import MainLayout from '../components/MainLayout';
import AuditLogsView from '../components/AuditLogsView';
import { useData } from '../context/DataContext';

export default function AuditLogsPage() {
    const { auditLogs, pagination, filters } = useData();

    return (
        <MainLayout>
            <AuditLogsView 
                auditLogs={auditLogs} 
                currentPage={pagination.auditPage} 
                totalItems={pagination.auditTotal} 
                pageSize={pagination.pageSize} 
                onPageChange={pagination.setAuditPage} 
                filterType={filters.auditType} 
                onFilterChange={filters.setAuditType} 
            />
        </MainLayout>
    );
}
