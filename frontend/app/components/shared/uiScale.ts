/**
 * Interface-scale (root `zoom`) unit helpers.
 *
 * The app renders under a root zoom — see the "Interface scale" block in
 * globals.css. That splits the DOM's pixel APIs into two different units, and
 * mixing them silently misplaces things by the zoom factor:
 *
 *   SCREEN px (divided by zoom already — what the user physically sees)
 *     getBoundingClientRect(), MouseEvent.clientX/Y, window.innerWidth/Height,
 *     window.scrollX/Y
 *
 *   LAYOUT px (the unit every CSS length is written in, then multiplied by zoom)
 *     clientHeight/offsetHeight/scrollHeight, getComputedStyle() values,
 *     and anything you assign to style.top / style.width / a React style prop
 *
 * So a dropdown positioned with `top: rect.bottom` lands at 80% of the way down
 * the page at 80% scale. Convert first: `top: toLayoutPx(rect.bottom)`.
 *
 * Verified in Chrome — at zoom 0.8 a 100px box measures 80 via
 * getBoundingClientRect but still reports clientHeight 100.
 */

/** Effective root zoom, e.g. 0.8 at 80% scale. Always 1 during SSR. */
export function uiZoom(): number {
    if (typeof document === 'undefined') return 1;
    const z = Number(getComputedStyle(document.documentElement).zoom);
    return Number.isFinite(z) && z > 0 ? z : 1;
}

/** Screen px → layout px. Use on every measured value before it becomes a CSS length. */
export function toLayoutPx(px: number): number {
    return px / uiZoom();
}

/** getBoundingClientRect() with every side already converted to layout px. */
export function layoutRectOf(el: Element) {
    const r = el.getBoundingClientRect();
    const z = uiZoom();
    return {
        top: r.top / z, bottom: r.bottom / z, left: r.left / z, right: r.right / z,
        width: r.width / z, height: r.height / z,
    };
}

/** window.innerWidth/innerHeight in layout px. */
export function layoutViewport(): { width: number; height: number } {
    const z = uiZoom();
    return { width: window.innerWidth / z, height: window.innerHeight / z };
}

/** window.scrollX/scrollY in layout px. */
export function layoutScroll(): { x: number; y: number } {
    const z = uiZoom();
    return { x: window.scrollX / z, y: window.scrollY / z };
}
