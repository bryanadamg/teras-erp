import { baseToAlt } from './altUnit';

// Carton split shared by every pack-logging screen.
//
// Mirrors `packing_service.split_qty` on the backend: a carton is a physical box
// of a known size, so the packer expects floor(total / size) full boxes with only
// the leftover in a smaller final box — never all boxes shrunk to absorb it.
// Both the desktop pack modal and the mobile packing scanner seed their editable
// box rows from this, so the two screens can never disagree about the split.

export type BoxRow = {
    /** Base-UOM qty in this carton. */
    qty: string;
    /** The packer's scale reading for this carton, in kg. Required at log time —
     *  logging happens after the boxes are physically packed and weighed, so a
     *  blank here would print a carton label with no N.W. line. */
    kg: string;
    /** Count in the order's alt selling unit (12 Pcs, 4 Pic). Empty when the
     *  order has no alt unit. On an alt-unit order this is what the packer types
     *  and `qty` derives from it — the count is the thing actually counted, and
     *  for a kg item `qty` ends up being the scale reading, which no longer
     *  divides back into a whole number of pieces. */
    alt: string;
};

export const splitBoxQtys = (total: number, size: number): number[] => {
    if (total <= 0) return [];
    if (!(size > 0)) return [Number(total.toFixed(4))];
    const full = Math.floor(total / size + 1e-9);
    const remainder = Number((total - full * size).toFixed(4));
    const parts = Array(full).fill(Number(size.toFixed(4)));
    if (remainder > 1e-6) parts.push(remainder);
    return parts.length ? parts : [Number(total.toFixed(4))];
};

/** Seed rows for a qty/size, carrying over any weights already keyed in.
 *
 *  `baseFactor` (base qty per alt unit) fills each row's alt count so an
 *  alt-unit order shows both figures from the start; a count the packer already
 *  typed is kept. */
export const seedBoxRows = (
    total: number,
    size: number,
    prev: BoxRow[] = [],
    baseFactor?: number | null,
): BoxRow[] =>
    splitBoxQtys(total, size).map((q, i) => {
        const derived = baseFactor ? baseToAlt(q, baseFactor) : null;
        return {
            qty: String(q),
            kg: prev[i]?.kg || '',
            alt: prev[i]?.alt || (derived !== null ? String(derived) : ''),
        };
    });

// UOMs whose base qty already IS a weight in kg — mirrors `packing_service.KG_UOMS`.
// For those, a carton's qty and its net weight are the same measurement, so the
// pack screens show ONE input and the server derives the weight from the qty;
// asking twice would let the label's CONTENT and N.W. lines contradict. Any other
// UOM (pcs, yard, m, l) is a count or a length whose weight is a separate reading.
// Defined in `altUnit` (the conversion module needs the same test) and re-exported
// here so the pack screens keep importing it from one place.
export { uomIsKg } from './altUnit';

// Parsed the same way the pack screens parse every other numeric field
// (`parseFloat`, not `Number`): the two disagree on a comma decimal and on
// trailing text, so a row could total as weighed in the footer while still
// counting as unweighed in the submit gate — a button dead for no visible reason.
const n = (v: string) => { const parsed = parseFloat(v); return isNaN(parsed) ? 0 : parsed; };

/** Rows that carry a qty — the ones actually sent to the server. */
export const filledBoxRows = (rows: BoxRow[]) => rows.filter(b => n(b.qty) > 0);

/** True when any carton is still unweighed; the server rejects those. */
export const hasUnweighedBox = (rows: BoxRow[]) =>
    filledBoxRows(rows).some(b => !(n(b.kg) > 0));

/** Total alt count across the filled rows, for the pack footer. */
export const boxAltTotal = (rows: BoxRow[]) =>
    filledBoxRows(rows).reduce((s, b) => s + n(b.alt), 0);

/** Alt counts to send, positional against `filledBoxRows` — null where the packer
 *  stated none, so the server derives that one rather than guessing all of them. */
export const boxAltPayload = (rows: BoxRow[]): (number | null)[] =>
    filledBoxRows(rows).map(b => (n(b.alt) > 0 ? n(b.alt) : null));
