'use client';

import QuarantinePackingView from '../components/stock/QuarantinePackingView';

// Self-fetching: pulls authFetch from DataContext and queries /quarantine itself
// (grouped by MO) plus /quarantine/statuses for the disposition list.
export default function QuarantinePackingPage() {
    return <QuarantinePackingView />;
}
