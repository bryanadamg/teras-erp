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

// Parsed the same way the pack screens parse every other numeric field
// (`parseFloat`, not `Number`): the two disagree on a comma decimal and on
// trailing text, so a row could total as weighed in the footer while still
// counting as unweighed in the submit gate — a button dead for no visible reason.
const n = (v: string) => { const parsed = parseFloat(v); return isNaN(parsed) ? 0 : parsed; };

export const splitBoxQtys = (total: number, size: number): number[] => {
    if (total <= 0) return [];
    if (!(size > 0)) return [Number(total.toFixed(4))];
    const full = Math.floor(total / size + 1e-9);
    const remainder = Number((total - full * size).toFixed(4));
    const parts = Array(full).fill(Number(size.toFixed(4)));
    if (remainder > 1e-6) parts.push(remainder);
    return parts.length ? parts : [Number(total.toFixed(4))];
};

// --- Carton groups ---------------------------------------------------------
//
// The pack screens edit cartons as `count × qty each`, not as one row per box:
// a 17 kg pack in 5 kg boxes reads "3 × 5 kg, 1 × 2 kg = 17 kg" rather than a
// four-row list the packer has to add up in their head. Groups are the edited
// shape; `expandBoxGroups` flattens them back to the per-carton rows the server
// is sent, so every downstream helper (totals, alt payload, weight gate) keeps
// working on one carton per entry and nothing about the wire format changes.

export type BoxGroup = {
    /** How many identical cartons this line stands for. */
    count: string;
    /** Base-UOM qty in each carton of the group. */
    qty: string;
    /** Alt-unit count per carton. Empty when the order has no alt unit. */
    alt: string;
    /** Per-carton scale readings, positional inside the group — cartons of the
     *  same qty still weigh differently, so a group holds a weight per box
     *  rather than one for all of them. Unused for a kg item, where the qty in
     *  the box already IS its net weight. May be shorter than `count`; a
     *  missing entry is an unweighed carton. */
    kg: string[];
};

export const emptyBoxGroup = (): BoxGroup => ({ count: '1', qty: '', alt: '', kg: [] });

/** Cartons the group stands for — a blank or fractional count is floored, since
 *  half a carton is not a thing the floor can pack. */
export const groupCount = (g: BoxGroup): number => Math.max(0, Math.floor(n(g.count)));

/** Base-UOM qty across a whole group. */
export const groupTotal = (g: BoxGroup): number => groupCount(g) * n(g.qty);

/** One row per physical carton — the shape the server is sent. */
export const expandBoxGroups = (groups: BoxGroup[]): BoxRow[] =>
    groups.flatMap(g =>
        Array.from({ length: groupCount(g) }, (_, i) => ({
            qty: g.qty,
            kg: g.kg[i] || '',
            alt: g.alt,
        })),
    );

/** Seed groups for a qty/size, carrying over weights already keyed in.
 *
 *  Weights are carried positionally across the *flattened* carton list rather
 *  than per group: re-splitting 17 kg from 5 kg boxes into 4 kg boxes changes
 *  how many boxes there are, and carton #2's scale reading still belongs to
 *  carton #2. */
export const seedBoxGroups = (
    total: number,
    size: number,
    prev: BoxGroup[] = [],
    baseFactor?: number | null,
): BoxGroup[] => {
    const prevWeights = expandBoxGroups(prev).map(r => r.kg);
    const qtys = splitBoxQtys(total, size);
    // splitBoxQtys emits `full` boxes of `size` then at most one remainder, so
    // the run-length grouping below is at most two lines by construction.
    const groups: BoxGroup[] = [];
    let taken = 0;
    for (const q of qtys) {
        const last = groups[groups.length - 1];
        if (last && n(last.qty) === q) {
            last.count = String(groupCount(last) + 1);
        } else {
            const derived = baseFactor ? baseToAlt(q, baseFactor) : null;
            groups.push({
                count: '1',
                qty: String(q),
                alt: derived !== null ? String(derived) : '',
                kg: [],
            });
        }
    }
    for (const g of groups) {
        const n_ = groupCount(g);
        g.kg = prevWeights.slice(taken, taken + n_);
        taken += n_;
    }
    return groups;
};

// UOMs whose base qty already IS a weight in kg — mirrors `packing_service.KG_UOMS`.
// For those, a carton's qty and its net weight are the same measurement, so the
// pack screens show ONE input and the server derives the weight from the qty;
// asking twice would let the label's CONTENT and N.W. lines contradict. Any other
// UOM (pcs, yard, m, l) is a count or a length whose weight is a separate reading.
// Defined in `altUnit` (the conversion module needs the same test) and re-exported
// here so the pack screens keep importing it from one place.
export { uomIsKg } from './altUnit';

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
