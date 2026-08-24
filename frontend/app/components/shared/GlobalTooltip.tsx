'use client';

/**
 * One document-level listener that upgrades EVERY native tooltip in the app.
 *
 * There are ~800 `title=` attributes across the views and ~90 places that clip
 * text to a fixed-width cell. Rewriting each into a `<Tooltip>` wrapper would be
 * a many-hundred-line diff that drifts again the moment someone types `title=`
 * out of habit — which they will, because that is what the attribute is for.
 *
 * So the attribute stays the API and this component changes what it renders:
 *
 *   - Hovering anything with a `title` suppresses the OS bubble (the attribute is
 *     lifted off the node for the duration of the hover and put back after) and
 *     shows the themed surface instead, at the element rather than at the cursor.
 *   - Hovering CLIPPED text with no title shows the full text. That case had no
 *     affordance at all before: an ellipsis with nothing behind it.
 *
 * What it deliberately does NOT touch:
 *   - Anything under `[data-no-tip]`. `Chip` / `CodeChip` mark themselves so their
 *     own popout (the chip re-drawn unclipped, in place) is the only surface —
 *     otherwise a clipped chip would show both.
 *   - Form controls' own browser UI (`<option>`, `<select>`) and iframes.
 *
 * Accessibility: `title` is the accessible name for icon-only controls, so it is
 * not simply deleted — it is parked on `data-original-title` (Bootstrap's own
 * tooltip does the same), mirrored to `aria-label` when the element has no other
 * name, and the surface is a real `role="tooltip"` wired up with
 * `aria-describedby`. Focus opens it as well as hover, so it is reachable from the
 * keyboard — which the native tooltip never was.
 *
 * Mounted once in `layout.tsx`, inside ThemeProvider (it reads the theme) and
 * outside anything that unmounts per route.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { AnchorRect, FloatingLayer, TooltipSurface, isClipped } from './Tooltip';
import { layoutRectOf } from './uiScale';

const DELAY_MS = 380;
/** How far up from the hovered node to look for a clipped box. Text is usually
 *  clipped by its own span or the cell one or two levels up, never further. */
const CLIP_DEPTH = 3;
/** Longest clipped string worth echoing on hover. Past this it is prose, not a label. */
const MAX_CLIP_TEXT = 180;

type Live = { el: HTMLElement; rect: AnchorRect; text: string };

const TIP_ID = 'app-tooltip-surface';

/** Does the element already have a name a screen reader can read without `title`? */
const hasOwnName = (el: HTMLElement) =>
    !!(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (el.textContent || '').trim());

const isFormNative = (el: Element) => {
    const t = el.tagName;
    return t === 'OPTION' || t === 'SELECT' || t === 'IFRAME';
};

export default function GlobalTooltip() {
    const { uiStyle } = useTheme();
    const classic = uiStyle === 'classic';
    const [live, setLive] = useState<Live | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // The node whose `title` we lifted, and what it said — so it goes back exactly
    // as it was. Losing this would strip tooltips permanently on hover.
    const stolen = useRef<{ el: HTMLElement; title: string } | null>(null);

    const restoreTitle = useCallback(() => {
        const s = stolen.current;
        if (s) {
            if (s.el.isConnected) {
                if (!s.el.getAttribute('title')) s.el.setAttribute('title', s.title);
                s.el.removeAttribute('data-original-title');
                if (s.el.getAttribute('data-tip-aria') === '1') {
                    s.el.removeAttribute('aria-label');
                    s.el.removeAttribute('data-tip-aria');
                }
                if (s.el.getAttribute('aria-describedby') === TIP_ID) s.el.removeAttribute('aria-describedby');
            }
            stolen.current = null;
        }
    }, []);

    const hide = useCallback(() => {
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
        restoreTitle();
        setLive(null);
    }, [restoreTitle]);

    useEffect(() => {
        const onOver = (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (!target || !(target instanceof HTMLElement)) return;
            if (target.closest('[data-no-tip]') || isFormNative(target)) {
                // A no-tip zone nested inside an already-titled ancestor (e.g. a
                // Chip with its own native title, inside a titled row) must not
                // leave the ancestor's custom bubble showing underneath it —
                // onOut alone won't catch this since the pointer never left the
                // ancestor's subtree.
                if (live) hide();
                return;
            }

            // A title anywhere up the chain wins: it is an author's explanation,
            // which beats echoing text the reader can already half-see.
            const titled = target.closest('[title]') as HTMLElement | null;
            let el: HTMLElement | null = null;
            let text = '';
            if (titled && (titled.getAttribute('title') || '').trim()) {
                el = titled;
                text = titled.getAttribute('title') as string;
            } else {
                // Otherwise: is the thing under the cursor cut off?
                let node: HTMLElement | null = target;
                for (let i = 0; i < CLIP_DEPTH && node; i++, node = node.parentElement) {
                    if (!isClipped(node)) continue;
                    const t = (node.textContent || '').trim();
                    // A label cut off by its column is worth showing. A scroll
                    // container (the reader can already scroll it) or a whole
                    // paragraph is not — that would be a wall of text on hover.
                    if (t.length < 2 || t.length > MAX_CLIP_TEXT) continue;
                    const ox = getComputedStyle(node).overflowX;
                    if (ox === 'auto' || ox === 'scroll') continue;
                    el = node;
                    text = t;
                    break;
                }
            }
            if (!el || !text) { if (live) hide(); return; }
            if (live && live.el === el) return;

            if (timer.current) clearTimeout(timer.current);
            const anchor = el;
            const content = text;
            timer.current = setTimeout(() => {
                if (!anchor.isConnected) return;
                // Suppress the OS bubble only once we are actually showing ours,
                // so a pass-through hover never mutates the DOM.
                const t = anchor.getAttribute('title');
                if (t) {
                    restoreTitle();
                    stolen.current = { el: anchor, title: t };
                    // Park it rather than destroy it, and keep the element named:
                    // for an icon-only button the title WAS the accessible name.
                    anchor.setAttribute('data-original-title', t);
                    if (!hasOwnName(anchor)) { anchor.setAttribute('aria-label', t); anchor.setAttribute('data-tip-aria', '1'); }
                    anchor.removeAttribute('title');
                }
                anchor.setAttribute('aria-describedby', TIP_ID);
                setLive({ el: anchor, rect: layoutRectOf(anchor), text: content });
            }, DELAY_MS);
        };

        const onOut = (e: MouseEvent) => {
            const to = e.relatedTarget as Node | null;
            const anchor = live?.el ?? stolen.current?.el;
            if (anchor && to && anchor.contains(to)) return;
            hide();
        };

        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };

        document.addEventListener('mouseover', onOver, true);
        document.addEventListener('mouseout', onOut, true);
        // Same handlers on focus: a keyboard user tabbing onto an icon button gets
        // the explanation a mouse user gets by hovering it.
        document.addEventListener('focusin', onOver as EventListener, true);
        document.addEventListener('focusout', hide, true);
        document.addEventListener('pointerdown', hide, true);
        window.addEventListener('scroll', hide, true);
        window.addEventListener('resize', hide);
        window.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mouseover', onOver, true);
            document.removeEventListener('mouseout', onOut, true);
            document.removeEventListener('focusin', onOver as EventListener, true);
            document.removeEventListener('focusout', hide, true);
            document.removeEventListener('pointerdown', hide, true);
            window.removeEventListener('scroll', hide, true);
            window.removeEventListener('resize', hide);
            window.removeEventListener('keydown', onKey);
            restoreTitle();
        };
    }, [live, hide, restoreTitle]);

    // Put the attribute back if the element leaves the DOM under us (route change,
    // row re-render) — otherwise the next mount inherits a title-less node.
    useEffect(() => () => restoreTitle(), [restoreTitle]);

    if (!live) return null;
    return (
        <FloatingLayer rect={live.rect} anchorEl={live.el} className="tip-anim">
            <TooltipSurface classic={classic} maxWidth={360} id={TIP_ID}>{live.text}</TooltipSurface>
        </FloatingLayer>
    );
}
