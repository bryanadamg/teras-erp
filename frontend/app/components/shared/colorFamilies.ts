// Groups a free-text colour name into one of ~13 coarse colour families, so the
// Colors (Variant) list can offer family filter chips over a flat alphabetical
// list of 139 curated names.
//
// This is a LEXICON, not language detection. Real values look like
// `ABU MUDA 06 (02)`, `BLK 301 (11)`, `DSR INDIGO GREY TUL INDIGO GREY` —
// short Indonesian/English colour words plus a mill code, with no ambiguity a
// statistical model would help resolve. A fixed word list is deterministic,
// reviewable, and correctable; an embedding would put `BEBAS` ("free/any") in a
// colour bucket with no way to argue with it.
//
// The base word→hex table is `COLOR_HEX` in xpTheme — the app's single colour
// vocabulary, already used to derive variant swatches on the BOM list and lab
// dip chips. Every key there is mapped to a family below, and `EXTRA_WORDS`
// adds only what COLOR_HEX has no entry for: mill abbreviations (BLK/GRY/BRN)
// and shade names (TAUPE, LILAC, SALEM).
import { COLOR_HEX } from './xpTheme';

export type ColorFamilyKey =
    | 'WHITE' | 'BLACK' | 'GREY' | 'BROWN' | 'BEIGE' | 'CREAM'
    | 'RED' | 'PINK' | 'PURPLE' | 'BLUE' | 'GREEN' | 'YELLOW' | 'ORANGE'
    | 'OTHER';

/** Display order of the chip bar — light neutrals, then darks, then hues. */
export const COLOR_FAMILY_ORDER: ColorFamilyKey[] = [
    'WHITE', 'CREAM', 'BEIGE', 'GREY', 'BLACK', 'BROWN',
    'RED', 'PINK', 'PURPLE', 'BLUE', 'GREEN', 'YELLOW', 'ORANGE', 'OTHER',
];

/** Every `COLOR_HEX` key, filed under a family. Families are deliberately
 *  coarser than the hex table: navy/dongker fold into BLUE, maroon/marun into
 *  RED, silver/perak into GREY, gold/emas into YELLOW. */
const BASE_WORD_FAMILY: Record<string, ColorFamilyKey> = {
    white: 'WHITE', putih: 'WHITE',
    cream: 'CREAM', krem: 'CREAM',
    beige: 'BEIGE', tan: 'BEIGE',
    grey: 'GREY', gray: 'GREY', abu: 'GREY', silver: 'GREY', perak: 'GREY',
    black: 'BLACK', hitam: 'BLACK',
    brown: 'BROWN', coklat: 'BROWN', cokelat: 'BROWN',
    red: 'RED', merah: 'RED', maroon: 'RED', marun: 'RED',
    pink: 'PINK',
    purple: 'PURPLE', ungu: 'PURPLE',
    blue: 'BLUE', biru: 'BLUE', navy: 'BLUE', dongker: 'BLUE', tosca: 'BLUE', toska: 'BLUE',
    green: 'GREEN', hijau: 'GREEN',
    yellow: 'YELLOW', kuning: 'YELLOW', gold: 'YELLOW', emas: 'YELLOW',
    orange: 'ORANGE', oranye: 'ORANGE', jingga: 'ORANGE',
};

/** Words with no `COLOR_HEX` entry: mill abbreviations and shade names seen in
 *  the live list. Add here rather than to COLOR_HEX unless the word also needs
 *  its own swatch hex app-wide. */
const EXTRA_WORDS: Record<string, ColorFamilyKey> = {
    WHT: 'WHITE', BROKEN: 'WHITE',
    CRM: 'CREAM', IVORY: 'CREAM',
    BEI: 'BEIGE', SAND: 'BEIGE', OAT: 'BEIGE', SKIN: 'BEIGE', NUDE: 'BEIGE', KHAKI: 'BEIGE',
    GRY: 'GREY', CHARCOAL: 'GREY', GREIGE: 'GREY',
    BLK: 'BLACK', ONYX: 'BLACK',
    BRN: 'BROWN', TAUPE: 'BROWN', MOCCA: 'BROWN', MOCHA: 'BROWN', COFFEE: 'BROWN',
    KOPI: 'BROWN', MULCH: 'BROWN', OVALTINE: 'BROWN', CHOCOLATE: 'BROWN',
    CRIMSON: 'RED', BURGUNDY: 'RED', WINE: 'RED', CABAI: 'RED',
    PNK: 'PINK', DADU: 'PINK', SALEM: 'PINK', PEACH: 'PINK', FUSCHIA: 'PINK',
    FUCHSIA: 'PINK', MAGENTA: 'PINK', ROSE: 'PINK', CORAL: 'PINK',
    VIOLET: 'PURPLE', LILAC: 'PURPLE', PLUM: 'PURPLE', MAUVE: 'PURPLE', LAVENDER: 'PURPLE',
    BLU: 'BLUE', DBL: 'BLUE', TURQIS: 'BLUE', TURQUOISE: 'BLUE', TEAL: 'BLUE',
    INDIGO: 'BLUE', DENIM: 'BLUE', AQUA: 'BLUE',
    GRN: 'GREEN', ARMY: 'GREEN', OLIVE: 'GREEN', LIME: 'GREEN', MINT: 'GREEN', EMERALD: 'GREEN',
    YLW: 'YELLOW', MUSTARD: 'YELLOW', LEMON: 'YELLOW', GLD: 'YELLOW', YEL: 'YELLOW',
    ORG: 'ORANGE',
    // Combo Library vocabulary. SAX = saxe blue, CHC = chocolate, MILO = the drink
    // (a mid brown), KHAKY = their spelling of khaki. WHY is a misspelling of WHT
    // that is consistent across the whole library — it appears only in BLKWHY,
    // NVYWHY and CGRYWHY, each pairing it with a dark, so it is white.
    NVY: 'BLUE', SAX: 'BLUE',
    SIL: 'GREY',
    CHC: 'BROWN', MILO: 'BROWN',
    KHAKY: 'BEIGE',
    WHY: 'WHITE',
};

const WORD_FAMILY: Record<string, ColorFamilyKey> = (() => {
    const map: Record<string, ColorFamilyKey> = {};
    for (const [word, family] of Object.entries(BASE_WORD_FAMILY)) map[word.toUpperCase()] = family;
    for (const [word, family] of Object.entries(EXTRA_WORDS)) map[word.toUpperCase()] = family;
    return map;
})();

/**
 * Splits an unseparated mill code into its parts: `BLKGLD` → BLACK + YELLOW,
 * `DBLUBLK` → BLUE + BLACK, `CGRYWHY` → GREY + WHITE. Roughly a sixth of the
 * Combo Library is written this way.
 *
 * Greedy left to right: on a hit, jump three characters; on a miss, advance one
 * (which is what finds `GRY` inside `CGRY…` and `BLK` inside `BKBLK`). The
 * caller only reaches this for a pure-alpha token of 5+ characters that matched
 * no whole word, so a real word that happens to contain a code is not at risk —
 * every colour word long enough to worry about (`MUSTARD`, `CHARCOAL`,
 * `TURQUOISE`) matches whole first, and the non-colour words in the live data
 * (`DESSERT`, `PRAMUKA`, `ZINNIA`, `SHADOW`, `MISTY`) contain no code at all.
 */
function familiesInCompound(token: string): ColorFamilyKey[] {
    const out: ColorFamilyKey[] = [];
    for (let i = 0; i + 3 <= token.length;) {
        const fam = WORD_FAMILY[token.slice(i, i + 3)];
        if (fam) { out.push(fam); i += 3; } else i += 1;
    }
    return out;
}

/** Representative swatch for a family chip. Read out of `COLOR_HEX` so the chip
 *  dot and the derived row swatch can never drift apart. */
export const COLOR_FAMILY_META: Record<ColorFamilyKey, { label: string; hex: string | null }> = {
    WHITE: { label: 'White', hex: COLOR_HEX.white },
    CREAM: { label: 'Cream', hex: COLOR_HEX.cream },
    BEIGE: { label: 'Beige', hex: COLOR_HEX.beige },
    GREY: { label: 'Grey', hex: COLOR_HEX.grey },
    BLACK: { label: 'Black', hex: COLOR_HEX.black },
    BROWN: { label: 'Brown', hex: COLOR_HEX.brown },
    RED: { label: 'Red', hex: COLOR_HEX.red },
    PINK: { label: 'Pink', hex: COLOR_HEX.pink },
    PURPLE: { label: 'Purple', hex: COLOR_HEX.purple },
    BLUE: { label: 'Blue', hex: COLOR_HEX.blue },
    GREEN: { label: 'Green', hex: COLOR_HEX.green },
    YELLOW: { label: 'Yellow', hex: COLOR_HEX.yellow },
    ORANGE: { label: 'Orange', hex: COLOR_HEX.orange },
    OTHER: { label: 'Other', hex: null },
};

/**
 * First colour word wins, scanning left to right.
 *
 * Two-tone names (`HITAM MERAH`, `NAVY ORANGE`, `DSR ABU TUL MERAH PUTIH`) file
 * under their leading word rather than a synthetic "multi" family — that is
 * where a human scanning the alphabetical list already looks for them, and it
 * keeps the chip counts summing exactly to the row count with no overlaps. It
 * also sidesteps names where two colour words are one shade (`RED VIOLET`,
 * `CREAM PINK`), which no rule can tell apart from a genuine two-tone.
 */
export function colorFamilyOf(name?: string | null): ColorFamilyKey {
    if (!name) return 'OTHER';
    for (const tok of String(name).toUpperCase().split(/[^A-Z0-9]+/)) {
        if (tok && WORD_FAMILY[tok]) return WORD_FAMILY[tok];
    }
    return 'OTHER';
}

/**
 * EVERY family named in the string, in reading order, deduped and capped — for
 * combos, where two or three colours ARE the entity (`BLACK WHITE`, `NVYRED`,
 * `DSR ABU TUL NAVY LIST NAVY`). `colorFamilyOf` above answers the different
 * question, "which one bucket does this name belong in".
 *
 * `OTHER` is never emitted: a word that names no family contributes nothing to a
 * band strip, and a strip of grey placeholders would be worse than a short one.
 * The cap keeps a strip readable — the longest live names run to five or six
 * colour words (`DSR HITAM PUTIH BINTIK PUTIH ABU BIRU MERAH`) and the leading
 * ones are the ground and rib, which is what the eye needs.
 */
export function colorFamiliesIn(name?: string | null, cap = 4): ColorFamilyKey[] {
    if (!name) return [];
    const out: ColorFamilyKey[] = [];
    const push = (f: ColorFamilyKey) => { if (f !== 'OTHER' && !out.includes(f)) out.push(f); };
    for (const tok of String(name).toUpperCase().split(/[^A-Z0-9]+/)) {
        if (out.length >= cap) break;
        if (!tok) continue;   // split() yields empties around a leading/trailing separator
        const whole = WORD_FAMILY[tok];
        if (whole) { push(whole); continue; }
        if (tok.length >= 5 && /^[A-Z]+$/.test(tok)) familiesInCompound(tok).forEach(push);
    }
    return out.slice(0, cap);
}

/** The band strip for a combo: one hex per family named, in order. Empty when the
 *  name says nothing colour-like, which the swatch renders as "no colour". */
export function colorBandsFor(name?: string | null, cap = 4): string[] {
    return colorFamiliesIn(name, cap)
        .map(f => COLOR_FAMILY_META[f].hex)
        .filter((h): h is string => !!h);
}

/** Family tallies for names that can belong to several families at once (combos).
 *  Counts deliberately OVERLAP and do not sum to the row count — the chip means
 *  "contains this colour", which is the question worth asking of a combo. */
export function colorFamilyMembershipCounts(values: { value?: string | null }[]): { key: ColorFamilyKey; count: number }[] {
    const tally = {} as Record<ColorFamilyKey, number>;
    for (const v of values || []) {
        const fams = colorFamiliesIn(v?.value);
        if (!fams.length) tally.OTHER = (tally.OTHER || 0) + 1;
        else for (const f of fams) tally[f] = (tally[f] || 0) + 1;
    }
    return COLOR_FAMILY_ORDER.filter(k => tally[k] > 0).map(k => ({ key: k, count: tally[k] }));
}

/** Swatch to show when a value has no saved `hex`: the exact word match the rest
 *  of the app already derives (`colorHexFor`), else the family's representative
 *  shade, else null (nothing colour-like in the name at all). */
export function derivedColorHex(name?: string | null): string | null {
    if (!name) return null;
    const k = String(name).trim().toLowerCase();
    if (COLOR_HEX[k]) return COLOR_HEX[k];
    for (const tok of k.split(/[^a-z0-9]+/)) if (tok && COLOR_HEX[tok]) return COLOR_HEX[tok];
    return COLOR_FAMILY_META[colorFamilyOf(name)].hex;
}

/** Family tallies over a set of values, in display order, families with no rows
 *  dropped — a chip for an empty bucket is a dead end. */
export function colorFamilyCounts(values: { value?: string | null }[]): { key: ColorFamilyKey; count: number }[] {
    const tally = {} as Record<ColorFamilyKey, number>;
    for (const v of values || []) {
        const k = colorFamilyOf(v?.value);
        tally[k] = (tally[k] || 0) + 1;
    }
    return COLOR_FAMILY_ORDER.filter(k => tally[k] > 0).map(k => ({ key: k, count: tally[k] }));
}
