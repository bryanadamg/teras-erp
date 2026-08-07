'use client';

import SampleReportView from '../components/samples/SampleReportView';

// The report is self-fetching (GET /samples/report is an aggregate the DataContext
// samples cache cannot answer — it counts transition events, not current rows).
export default function SampleReportPage() {
    return <SampleReportView />;
}
