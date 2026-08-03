/**
 * Paper geometry — the single place a `PaperSpec` turns into millimetres.
 *
 * Named sizes stay stored as a name (`A6`), not as numbers, so a template keeps
 * meaning something if a sheet standard is ever restated. `custom` carries its own
 * dims instead, which is how the client prints on the pre-cut stock the floor
 * actually buys (thermal label rolls, half-Folio job tickets) rather than being
 * limited to the A series.
 *
 * The designer preview AND the print-time `@page` rule both read through here.
 * Keeping one source is the point: a second copy of the numbers is exactly how a
 * preview drifts from the printout.
 */

import type { PaperSpec } from './types';

/** Portrait dimensions in mm for each named size. */
export const NAMED_PAPER_MM: Record<string, [number, number]> = {
    A4: [210, 297],
    A5: [148, 210],
    A6: [105, 148],
};

/** Guard rails for custom dims — a 0mm or 5m sheet is a typo, not a page. */
export const CUSTOM_MIN_MM = 20;
export const CUSTOM_MAX_MM = 1000;

const DEFAULT_CUSTOM_MM: [number, number] = NAMED_PAPER_MM.A6;

const clampMm = (v: number | undefined, fallback: number): number => {
    if (!v || !Number.isFinite(v)) return fallback;
    return Math.min(CUSTOM_MAX_MM, Math.max(CUSTOM_MIN_MM, v));
};

/**
 * The sheet's dimensions *before* orientation, i.e. as the size is quoted. Custom
 * dims are treated the same way: the user types the portrait sheet, and
 * `orientation: 'landscape'` swaps it, so flipping orientation never rewrites them.
 */
export function paperPortraitMm(paper: PaperSpec | undefined): [number, number] {
    if (!paper) return NAMED_PAPER_MM.A4;
    if (paper.size === 'custom') {
        return [
            clampMm(paper.widthMm, DEFAULT_CUSTOM_MM[0]),
            clampMm(paper.heightMm, DEFAULT_CUSTOM_MM[1]),
        ];
    }
    return NAMED_PAPER_MM[paper.size] || NAMED_PAPER_MM.A4;
}

/** Final on-paper dimensions in mm, orientation applied. */
export function paperDimsMm(paper: PaperSpec | undefined): { widthMm: number; heightMm: number } {
    const [wMm, hMm] = paperPortraitMm(paper);
    const landscape = paper?.orientation === 'landscape';
    return { widthMm: landscape ? hMm : wMm, heightMm: landscape ? wMm : hMm };
}

/**
 * Value for the `size` descriptor of an `@page` rule.
 *
 * Always explicit mm — never `A6 landscape` — because the dims above have already
 * had orientation applied, and mixing a keyword form for named sizes with the mm
 * form for custom ones is a second code path that only one of the two exercises.
 */
export function paperCssSize(paper: PaperSpec | undefined): string {
    const { widthMm, heightMm } = paperDimsMm(paper);
    return `${widthMm}mm ${heightMm}mm`;
}

/** Human label for the preview caption, e.g. `A6 portrait` / `Custom`. */
export function paperSizeLabel(paper: PaperSpec | undefined): string {
    return paper?.size === 'custom' ? 'Custom' : (paper?.size || 'A4');
}
