'use client';

import React, { useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

/**
 * One camera, one mount point, one decode callback.
 *
 * Every scan surface in the app had its own copy of this `Html5QrcodeScanner`
 * setup — same fps, same environment-facing constraints, same 70%-of-the-short-
 * side qrbox, same teardown — and they had already drifted (torch on some,
 * fixed 180px boxes on others). Reading a lot label off a bag in a dim weaving
 * hall is the same job everywhere, so the optics are not a per-view decision.
 *
 * Rules this component encodes, from CLAUDE.md's Scanner Entry Point section:
 *  - **One live camera per page.** Mounting a second one while the first is
 *    running gives two video tracks fighting for the device. Render this
 *    conditionally and unmount the other branch first.
 *  - Repeat reads are the caller's problem, not the camera's: a QR in frame
 *    fires many frames a second, so `onDecode` must debounce by code. (Both
 *    current callers keep a `code -> last-seen ms` map.)
 *
 * `id` must be unique on the page — html5-qrcode addresses its container by
 * DOM id, so two instances sharing an id render into each other.
 */
export default function CameraScanner({
    id,
    onDecode,
    height,
}: {
    id: string;
    onDecode: (decoded: string) => void;
    /** Optional cap on the video box; omit to let it size to its container. */
    height?: number;
}) {
    const scannerRef = useRef<Html5QrcodeScanner | null>(null);
    // Held in a ref so a re-render with a fresh closure doesn't tear the camera
    // down and back up mid-scan (which is what a dependency on onDecode would do).
    const onDecodeRef = useRef(onDecode);
    onDecodeRef.current = onDecode;

    useEffect(() => {
        // The container has to exist before html5-qrcode looks it up by id, and on
        // first paint this effect can run ahead of the div being committed.
        const timer = setTimeout(() => {
            if (!document.getElementById(id)) return;
            const scanner = new Html5QrcodeScanner(id, {
                fps: 10,
                // Aim box tracks the viewport instead of a fixed 180px square: on a
                // phone held over a bag the label fills the frame, on a desktop
                // webcam it does not.
                qrbox: (vw: number, vh: number) => {
                    const size = Math.max(180, Math.floor(Math.min(vw, vh) * 0.7));
                    return { width: size, height: size };
                },
                useBarCodeDetectorIfSupported: true,
                showTorchButtonIfSupported: true,
                videoConstraints: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1280 }, height: { ideal: 720 },
                    advanced: [{ focusMode: 'continuous' } as any],
                } as MediaTrackConstraints,
            }, false);
            scannerRef.current = scanner;
            scanner.render((decoded: string) => onDecodeRef.current(decoded), () => {});
        }, 100);
        return () => {
            clearTimeout(timer);
            scannerRef.current?.clear().catch(() => {});
            scannerRef.current = null;
        };
    }, [id]);

    return <div id={id} style={height ? { maxHeight: height } : undefined} />;
}
