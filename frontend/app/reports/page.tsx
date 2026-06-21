'use client';

import ReportsView from '../components/dashboard/ReportsView';

// ReportsView is self-fetching: it pulls authFetch/locations/attributes from
// DataContext and queries /stock itself with server-side filters + pagination.
export default function ReportsPage() {
    return <ReportsView />;
}
