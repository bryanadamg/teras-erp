'use client';

import MachineOutputReportView from '../components/dashboard/MachineOutputReportView';

// Self-fetching like ReportsView: pulls authFetch/workCenters from DataContext and
// queries /reports/machine-output with server-side filters + aggregation.
export default function MachineReportPage() {
    return <MachineOutputReportView />;
}
