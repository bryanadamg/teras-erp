/**
 * The three font stacks, in their own module.
 *
 * They live here rather than in `xpTheme.tsx` only so that low-level primitives
 * `xpTheme` itself imports (Tooltip) can use them without an import cycle.
 * `xpTheme` re-exports all three, so every existing
 * `import { xpFont } from '../shared/xpTheme'` keeps working — import from
 * either, they are the same constants.
 */

export const xpFont = 'Tahoma, "Segoe UI", Arial, sans-serif';
export const modernFont = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

// Single monospace stack for every identifier and every aligned number. Views used
// to pick between `'Courier New', monospace` and a bare `monospace` per file, which
// resolve to different faces on Windows — the same MO code rendered two widths on
// two pages. Always import this; never hand-write a mono stack.
export const CODE_FONT = "'Courier New', Consolas, monospace";
