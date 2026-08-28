'use client';

import React from 'react';
import ModalWrapper from '../shared/ModalWrapper';
import { useTheme } from '../../context/ThemeContext';
import { xpFont, modernFont, CODE_FONT, FormSection, CHIP_RADIUS, XP_BTN } from '../shared/xpTheme';
import { lvBtn } from '../shared/listViewTheme';
import { EPS, HEALTH, TERM } from './bookingStockTheme';

// "How is this calculated?" — the modeless explainer behind the ⓘ button on the
// Booking Stock toolbar. It documents the ACTUAL netting pass, which lives in
// backend/app/api/stock.py :: _compute_booking_rows() (with the committed-supply
// and reject rules shared from services/netting_service.py). If that pass changes,
// this panel changes with it: a planner who trusts a stale explanation of a
// shortfall figure is worse off than one who has none.

export default function BookingStockInfoModal({ isOpen, onClose }: {
    isOpen: boolean;
    onClose: () => void;
}) {
    const { uiStyle } = useTheme();
    const classic = uiStyle === 'classic';

    const font = classic ? xpFont : modernFont;
    const body: React.CSSProperties = {
        fontFamily: font, fontSize: classic ? 11 : 12.5,
        lineHeight: 1.55, color: '#2b2b2b',
    };
    // Formula / expression fragments. Monospace and tinted so a reader can see at a
    // glance that these are the machine's rules, not narrative.
    const code = (extra: React.CSSProperties = {}): React.CSSProperties => ({
        fontFamily: CODE_FONT, fontSize: classic ? 10.5 : 11.5,
        background: '#f4f6fa', border: '1px solid #d5dbe6', borderRadius: CHIP_RADIUS,
        padding: '6px 9px', margin: '6px 0 0', display: 'block',
        whiteSpace: 'pre-wrap', color: '#1a2c4a', ...extra,
    });
    const kw = (color: string): React.CSSProperties => ({ color, fontWeight: 700 });
    const p: React.CSSProperties = { margin: '0 0 7px' };
    const last: React.CSSProperties = { margin: 0 };
    const ul: React.CSSProperties = { margin: '0 0 7px', paddingLeft: 18 };
    const li: React.CSSProperties = { marginBottom: 3 };
    // Inline term reference — "Required", "Incoming" etc. in the colour of its column.
    const T = ({ c, children }: { c: string; children: React.ReactNode }) =>
        <b style={{ color: c }}>{children}</b>;

    return (
        <ModalWrapper
            isOpen={isOpen}
            onClose={onClose}
            modeless
            size="xl"
            variant="info"
            title={<><i className="bi bi-info-circle me-1" />How Booking Stock is calculated</>}
            footer={
                <button type="button" className={XP_BTN} style={lvBtn(classic)} onClick={onClose}>Close</button>
            }
        >
            <div style={body}>
                {/* ── The formula itself ───────────────────────────────────────── */}
                <div style={{
                    border: `1px solid ${classic ? '#a8b4c8' : '#dbe1ea'}`,
                    borderRadius: 6, background: '#fbfcfe',
                    padding: classic ? '10px 12px' : '12px 14px', marginBottom: 12,
                }}>
                    <div style={{
                        fontFamily: CODE_FONT, fontSize: classic ? 13 : 15,
                        textAlign: 'center', letterSpacing: '0.02em', color: '#1a2c4a',
                    }}>
                        <b>Net Free</b>{'  =  '}
                        <span style={kw(TERM.onHand)}>On Hand</span>{'  +  '}
                        <span style={kw(TERM.incoming)}>Incoming</span>{'  −  '}
                        <span style={kw(TERM.required)}>Required</span>
                    </div>
                    <div style={{ marginTop: 8, fontSize: classic ? 10.5 : 12, color: '#555', textAlign: 'center' }}>
                        One row per <b>item + variant</b>, netted <b>plant-wide</b>. A row exists only if some
                        ongoing Manufacturing Order still demands that component.
                    </div>
                    <div style={{
                        marginTop: 9, paddingTop: 8, borderTop: '1px dashed #ccd4e0',
                        display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center',
                        fontSize: classic ? 10 : 11.5,
                    }}>
                        <span style={{ color: HEALTH.short.color }}>
                            <i className="bi bi-square-fill" style={{ marginRight: 4 }} />
                            <b>Shortfall</b> — net free is negative: the demand cannot be met
                        </span>
                        <span style={{ color: HEALTH.tight.color }}>
                            <i className="bi bi-square-fill" style={{ marginRight: 4 }} />
                            <b>Tight</b> — net free is zero (±{EPS}): covered with nothing spare
                        </span>
                        <span style={{ color: HEALTH.ok.color }}>
                            <i className="bi bi-square-fill" style={{ marginRight: 4 }} />
                            <b>OK</b> — net free is positive
                        </span>
                    </div>
                </div>

                {/* ── Scope ────────────────────────────────────────────────────── */}
                <FormSection title="1 · Which orders are in scope" classic={classic}>
                    <p style={p}>
                        Every Manufacturing Order whose status is <b>PENDING</b>, <b>IN&nbsp;PROGRESS</b> or
                        <b> DELIVERED</b> is walked, plant-wide. Each one is first reduced to what it has
                        <i> left to do</i>:
                    </p>
                    <code style={code()}>
                        completed   = Σ qty_completed of completion logs that are NOT rejected{'\n'}
                        outstanding = MO qty − completed
                    </code>
                    <p style={{ ...p, marginTop: 7 }}>
                        An MO with <code style={{ fontFamily: CODE_FONT }}>outstanding ≤ 0</code> contributes
                        nothing — neither demand nor supply. <b>DELIVERED</b> orders are included for exactly
                        that reason: they normally net to zero, but if their quantity is later raised, or their
                        output is rejected, they re-enter the calculation on their own.
                    </p>
                    <p style={last}>
                        Everything downstream is therefore <b>outstanding-based</b>: quantity already produced
                        stops being counted, so the figures fall as the floor logs work rather than only when an
                        order closes.
                    </p>
                </FormSection>

                {/* ── Required ─────────────────────────────────────────────────── */}
                <FormSection title={<>2 · Required — outstanding demand</>} classic={classic}>
                    <p style={p}>
                        Demand comes from each order's <b>planned components</b> — the BOM lines snapshotted at
                        MO creation, not the live BOM. Editing a BOM never moves the requirement of an order
                        already in flight.
                    </p>
                    <code style={code()}>
                        required = outstanding × percentage ÷ 100     (percentage lines){'\n'}
                        required = outstanding × qty                  (fixed-qty lines){'\n'}
                        required = required × (1 + BOM tolerance % ÷ 100)   (if the BOM sets one)
                    </code>
                    <p style={{ ...last, marginTop: 7 }}>
                        Contributions are summed across every order, and kept per-order: expanding a row lists
                        each MO under <T c={TERM.required}>Required by</T> with its own share, so a shortfall
                        can be traced to the orders causing it.
                    </p>
                </FormSection>

                {/* ── Incoming ─────────────────────────────────────────────────── */}
                <FormSection title="3 · Incoming — scheduled receipts" classic={classic}>
                    <p style={p}>
                        <T c={TERM.incoming}>Incoming</T> is the <b>outstanding output of orders already in
                        flight that produce this item</b> — work the plant is going to finish anyway, so it is
                        credited before you decide to buy or make more.
                    </p>
                    <p style={p}>
                        One rule removes output from this pool — the <b>committed-supply rule</b>. An order's
                        output is treated as promised, and never offered to other demand, when <i>all</i> of
                        these hold:
                    </p>
                    <ul style={ul}>
                        <li style={li}>it is a <b>root</b> order (it has no parent MO), and</li>
                        <li style={li}>it is not flagged as a <b>shared component</b>, and</li>
                        <li style={li}>it is linked to a <b>sales order</b> — directly, or through its Production Run.</li>
                    </ul>
                    <p style={last}>
                        Child and shared-component orders always stay in supply (their output is already
                        balanced by the consuming order's component demand), and an uncommitted root is a
                        deliberate stock-build, so its output is deliberately free.
                        <b> Purchase orders are not counted</b> — incoming is production only.
                    </p>
                </FormSection>

                {/* ── On hand ──────────────────────────────────────────────────── */}
                <FormSection title="4 · On Hand — physical good stock" classic={classic}>
                    <p style={p}>
                        <T c={TERM.onHand}>On Hand</T> is the current stock balance summed across
                        <b> every location</b> for that item and variant. Netting is deliberately
                        location-agnostic — one plant, one pool — which is why the Location column reads
                        <i> Plant-wide</i> on every row.
                    </p>
                    <p style={last}>
                        Lots that are not good stock are excluded: <b>REJECTED</b>, <b>REJECT&nbsp;USABLE</b>
                        and <b>DISPOSED</b>. A reject-usable lot may still be picked deliberately, but it must
                        never silently satisfy planned demand, so it does not count here.
                    </p>
                </FormSection>

                {/* ── Keying ───────────────────────────────────────────────────── */}
                <FormSection title="5 · How a row is keyed" classic={classic}>
                    <p style={p}>
                        Rows are keyed by <b>(item, variant)</b> — the sorted set of attribute values, with a
                        finished good's colour folded in as a trailing token so two shades of one item net
                        separately. Demand and stock are matched on that exact key.
                    </p>
                    <p style={last}>
                        Consequence worth knowing: <b>lot-identity items</b> (beams, lot-tracked items) carry
                        their identity in the batch, not in the variant key, so their balance rows have an
                        empty variant. If such a component is demanded <i>with</i> attribute values, its
                        on-hand will not match that key here. The Production Run material panel compensates
                        for this; this page does not.
                    </p>
                </FormSection>

                {/* ── Freshness ────────────────────────────────────────────────── */}
                <FormSection title="6 · How fresh the numbers are" classic={classic}>
                    <p style={p}>
                        The netting pass is expensive, so it is computed once and shared. Results are held for
                        <b> 60&nbsp;seconds</b>, and are marked stale immediately by any stock, Manufacturing
                        Order, Work Order or Production Run change.
                    </p>
                    <p style={last}>
                        Stale rows keep being served: a request returns what is cached <i>now</i> and starts a
                        single recompute in the background, so the next load is fresh. Between a shop-floor
                        change and that refresh, a figure can be a few seconds behind — an accepted trade for
                        never blocking the page on a full recompute. <b>Refresh</b> re-reads that shared
                        result rather than forcing a recompute — if it was stale, what you see may still be
                        the previous figures, with the new ones arriving on the next read.
                    </p>
                </FormSection>

                {/* ── Boundaries ───────────────────────────────────────────────── */}
                <FormSection title="7 · What this figure is not" classic={classic}
                    style={{ marginBottom: 0 }}>
                    <ul style={{ ...ul, marginBottom: 0 }}>
                        <li style={li}>
                            <b>Not a reservation.</b> Nothing here locks or allocates stock. It is an advisory
                            planning view — the numbers say who <i>wants</i> what, not who <i>owns</i> it.
                        </li>
                        <li style={li}>
                            <b>Not a purchasing forecast.</b> Open purchase orders never appear as incoming.
                        </li>
                        <li style={li}>
                            <b>Not per-location.</b> A positive net free does not promise the stock sits at the
                            work centre that needs it.
                        </li>
                        <li style={li}>
                            <b>Not a dispatch decision.</b> The Work Queue answers "what can I start next?",
                            walking on-hand stock in priority-date order so two orders needing the same greige
                            cannot both read READY. Booking Stock intentionally does no such ordering — it
                            reports the whole plant's balance in one figure.
                        </li>
                        <li style={{ ...li, marginBottom: 0, color: '#666' }}>
                            Source of truth: <code style={{ fontFamily: CODE_FONT }}>
                                backend/app/api/stock.py → _compute_booking_rows()</code>
                        </li>
                    </ul>
                </FormSection>
            </div>
        </ModalWrapper>
    );
}
