/**
 * The three font stacks, in their own module.
 *
 * They live here rather than in `xpTheme.tsx` only so that low-level primitives
 * `xpTheme` itself imports (Tooltip) can use them without an import cycle.
 * `xpTheme` re-exports all three, so every existing
 * `import { xpFont } from '../shared/xpTheme'` keeps working — import from
 * either, they are the same constants.
 */

// Inter is self-hosted (public/fonts/inter/, @font-face in globals.css) rather than
// pulled from Google Fonts — the classic theme runs on shop-floor machines that may
// have no outbound internet, and font-display: swap falls back to Tahoma instantly
// if the local file somehow fails to load. Keep in step with --xp-font in globals.css.
export const xpFont = '"Inter", Tahoma, "Segoe UI", Arial, sans-serif';
export const modernFont = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

// Single monospace stack for every identifier and every aligned number. Views used
// to pick between `'Courier New', monospace` and a bare `monospace` per file, which
// resolve to different faces on Windows — the same MO code rendered two widths on
// two pages. Always import this; never hand-write a mono stack.
export const CODE_FONT = "'Courier New', Consolas, monospace";

// Printed documents (Kartu Kerja, MO/PO/SO prints, labels) are deliberately NOT
// classic/modern themed — paper doesn't have a theme — but every print modal used to
// hand-write its own 'Arial, sans-serif' / 'Arial, Helvetica, sans-serif' literal, so
// the fallback chain drifted between documents. One stack for all of them.
export const PRINT_FONT = 'Arial, Helvetica, sans-serif';

// The rare print-header accent (KARTU PACKING/PICKING, SO confirmation title) that
// intentionally breaks from PRINT_FONT for emphasis. Still one shared literal.
export const PRINT_SERIF_FONT = 'Georgia, serif';
