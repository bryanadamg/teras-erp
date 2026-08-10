'use client';

import LabDipReportView from '../components/lab-dips/LabDipReportView';

// The report is self-fetching (GET /lab-dips/report is an aggregate no lab dip list
// can answer — it counts transition events, not current rows).
export default function LabDipReportPage() {
    return <LabDipReportView />;
}
