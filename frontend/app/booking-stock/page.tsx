'use client';

import BookingStockView from '../components/stock/BookingStockView';

// BookingStockView is self-fetching: it pulls authFetch/locations/attributes from
// DataContext and queries /stock/availability itself (optional location filter).
export default function BookingStockPage() {
    return <BookingStockView />;
}
