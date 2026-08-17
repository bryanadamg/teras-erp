'use client';

import React, { useEffect, useState } from 'react';
import { ProgressBar, xpFont } from './xpTheme';
import type { BootPhase } from '../../context/UserContext';

/**
 * Boot screen shown before the shell can render — while the client bundle is
 * hydrating and while a stored token is being validated against /users/me.
 *
 * The bar is determinate because the boot sequence is a fixed, ordered set of
 * awaited checkpoints (see BootPhase in UserContext), not because a timer is
 * animating it. Each phase is set on its own render pass so the step it names
 * actually paints; 'ready' is the terminal value, at which point this whole
 * component unmounts and never shows 100%.
 *
 * The *data* load that follows login is a different, separately measured thing
 * — that one is AppLoadBar's strip inside the shell. Don't merge them: this
 * runs before there is a shell to put a strip in.
 */

const BOOT_STEPS: { phase: BootPhase; label: string }[] = [
    { phase: 'hydrating', label: 'Loading interface' },
    { phase: 'session', label: 'Restoring session' },
    { phase: 'verifying', label: 'Verifying account' },
    { phase: 'ready', label: 'Ready' },
];

export default function BootSplash({ phase }: { phase: BootPhase }) {
    const [appName, setAppName] = useState('Teras ERP');

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
