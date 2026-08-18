'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ProgressBar, xpFont } from './xpTheme';
import type { BootPhase } from '../../context/UserContext';

/**
 * Boot screen for the case where there is no chrome to draw yet — the login
 * route and the Electron cold start. Authenticated routes get BootShell
 * instead, which paints the real app frame rather than covering it.
 *
 * The bar is determinate because the boot sequence is a fixed, ordered set of
 * awaited checkpoints (see BootPhase in UserContext), not because a timer is
 * animating it. Each phase is set on its own render pass so the step it names
 * actually paints; 'ready' is the terminal value, at which point this whole
 * component unmounts and never shows 100%.
 *
 * Two timing guards, both standard and both load-bearing:
 *  - SHOW_DELAY: a boot that resolves faster than this shows nothing at all. A
 *    warm start with no stored token finishes in a few ms, and flashing a
 *    splash across it makes the app feel slower than saying nothing.
 *  - MIN_VISIBLE: once shown, it stays up for at least this long. A splash that
 *    appears and vanishes within one or two frames reads as a glitch.
 *
 * The *data* load that follows login is a different, separately measured thing
 * — that one is AppLoadBar's strip inside the shell. Don't merge them: this
 * runs before there is a shell to put a strip in.
 */

const SHOW_DELAY = 250;
const MIN_VISIBLE = 400;

const BOOT_STEPS: { phase: BootPhase; label: string }[] = [
    { phase: 'hydrating', label: 'Loading interface' },
    { phase: 'session', label: 'Restoring session' },
    { phase: 'verifying', label: 'Verifying account' },
    { phase: 'ready', label: 'Ready' },
];

/**
 * Gates the splash on the two timing guards above. Call it unconditionally with
 * "is the app still booting", then render the splash only while it returns
 * true — and render *nothing* when it is false but boot is still running (that
 * is the sub-250ms window the guard exists to keep empty).
 *
 * Min-visible can't live inside the component: the caller unmounts it the
 * moment boot resolves, so the floor has to be held by whoever decides to
 * render it.
 */
export function useBootIndicator(active: boolean): boolean {
    const [visible, setVisible] = useState(false);
    const shownAt = useRef(0);

    useEffect(() => {
        if (active) {
            if (visible) return;
            const t = setTimeout(() => {
                shownAt.current = Date.now();
                setVisible(true);
            }, SHOW_DELAY);
            return () => clearTimeout(t);
        }
        if (!visible) return;
        const remaining = Math.max(0, MIN_VISIBLE - (Date.now() - shownAt.current));
        if (remaining === 0) {
            setVisible(false);
            return;
        }
        const t = setTimeout(() => setVisible(false), remaining);
        return () => clearTimeout(t);
    }, [active, visible]);

    return visible;
}

export default function BootSplash({ phase }: { phase: BootPhase }) {
    const [appName, setAppName] = useState('Terras ERP');

    useEffect(() => {
        const saved = localStorage.getItem('app_name');
        if (saved) setAppName(saved);
    }, []);

    const idx = Math.max(0, BOOT_STEPS.findIndex(s => s.phase === phase));
    const step = BOOT_STEPS[idx];
    const pct = ((idx + 1) / BOOT_STEPS.length) * 100;

    return (
        <div
            style={{
                position: 'fixed', inset: 0, background: '#ece9d8',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: xpFont, userSelect: 'none',
            }}
        >
            <div style={{ width: 300, textAlign: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 'bold', color: '#1a3d90', marginBottom: 2 }}>
                    {appName}
                </div>
                <div style={{ fontSize: 11, color: '#5a6470', marginBottom: 14 }}>
                    Starting…
                </div>

                <div
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={BOOT_STEPS.length}
                    aria-valuenow={idx + 1}
                    aria-label={step.label}
                >
                    <ProgressBar pct={pct} tone="blue" height={14} />
                </div>

                <div
                    style={{
                        display: 'flex', justifyContent: 'space-between',
                        marginTop: 6, fontSize: 11, color: '#33393f',
                    }}
                >
                    <span>{step.label}…</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', color: '#5a6470' }}>
                        {idx + 1} of {BOOT_STEPS.length}
                    </span>
                </div>
            </div>
        </div>
    );
}
