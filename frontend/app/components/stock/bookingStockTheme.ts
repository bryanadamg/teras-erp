// Shared vocabulary of the Booking Stock page: the health bands the table
// colour-codes rows by, and the per-term colours of the three inputs to the
// net-free formula. Lives here rather than inside BookingStockView so the
// "How is this calculated?" panel can paint `On Hand + Incoming − Required`
// in exactly the colours the table's columns use — a second copy of these hexes
// would drift and the explainer would stop matching the thing it explains.

// Net-free health, with a small epsilon so float dust doesn't read as a shortfall.
export const EPS = 0.0005;

export const HEALTH = {
    short: { color: '#c00000', tint: '#fdeeee', label: 'SHORT' },
    tight: { color: '#9a6a00', tint: '#fff8e6', label: 'TIGHT' },
    ok:    { color: '#2d7a2d', tint: '#ffffff', label: 'OK' },
};

export const healthOf = (nf: number) => (nf < -EPS ? HEALTH.short : nf <= EPS ? HEALTH.tight : HEALTH.ok);

// The three inputs to net_free, each in the colour its table column is rendered in.
export const TERM = {
    onHand:   '#00008b',
    incoming: '#1a5e2a',
    required: '#7a3a00',
};
