'use client';
import React, { useRef } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import { MODAL_Z, MODAL_REPOSITION_EVENT } from './ModalWrapper';

interface PrintModalShellProps {
    title: React.ReactNode;
    onClose: () => void;
    children: React.ReactNode;   // body + footer, exactly as each print modal already built them —
                                 // shell only replaces the backdrop/panel/header boilerplate that was
                                 // byte-for-byte duplicated across all 10 print modals.
    width?: string;
    maxWidth?: number;
    height?: string;
    bevel?: boolean;             // classic 2px bevel border on the panel (defaults true — matches the
                                 // majority; pass false for the print types that never had it, to keep
                                 // this refactor visually a no-op).
    closeGlyph?: 'X' | '✕';
    /**
     * Modeless window: no backdrop, background page stays interactive, panel is
     * draggable by its title bar. Ignored on mobile (falls back to a normal
     * blocking modal). Matches ModalWrapper's `modeless`.
     */
    modeless?: boolean;
}

// Shared shell for print-preview modals (WO/BOM/Sample/SO/PO/StockLedger/DyeRecipe print).
// These are transient, always-on-top actions — same tier as ConfirmModal (level 3) so a
// print triggered from inside an already-open modeless modal still renders above it.
// Previously each of the 10 print modals hand-rolled this exact backdrop+header shell with
// a hardcoded `zIndex: 2000`, which is BELOW ModalWrapper's MODAL_Z scale (20000+) — opening
// a print from inside an open modal rendered it underneath, unreachable. Fixed by reusing
// the same MODAL_Z constant ModalWrapper itself exports for this exact "can't use
// ModalWrapper directly" case.
export default function PrintModalShell({
    title, onClose, children,
    width = '90vw', maxWidth = 960, height = '88vh',
    bevel = true, closeGlyph = 'X', modeless = false,
}: PrintModalShellProps) {
    const { uiStyle } = useTheme();
    const classic = uiStyle === 'classic';
    const isMobile = useIsMobile();
    const floating = modeless && !isMobile;

    const panelRef = useRef<HTMLDivElement>(null);
    const dragOffset = useRef({ x: 0, y: 0 });

    // Drag mutates the DOM transform directly (no React re-render), mirroring
    // ModalWrapper — stays smooth on old hardware, and dispatches the shared
    // reposition event so anchored portaled dropdowns stay glued.
    const startDrag = (e: React.PointerEvent) => {
        if (!floating || !panelRef.current) return;
        if ((e.target as HTMLElement).closest('button')) return;
        e.preventDefault();
        const startX = e.clientX, startY = e.clientY;
        const base = { ...dragOffset.current };
        const el = panelRef.current;
        const onMove = (ev: PointerEvent) => {
            dragOffset.current = { x: base.x + ev.clientX - startX, y: base.y + ev.clientY - startY };
            el.style.transform = `translate(calc(-50% + ${dragOffset.current.x}px), ${dragOffset.current.y}px)`;
            window.dispatchEvent(new Event(MODAL_REPOSITION_EVENT));
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    };

    const headerStyle: React.CSSProperties = classic ? {
        background: 'linear-gradient(to right, #0058e6 0%, #08a5ff 100%)', color: '#fff',
        fontFamily: 'Tahoma, Arial, sans-serif', fontSize: 12, fontWeight: 'bold',
        padding: '4px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
        cursor: floating ? 'move' : undefined, touchAction: floating ? 'none' : undefined, userSelect: floating ? 'none' : undefined,
    } : {
        background: '#0d6efd', color: '#fff', padding: '10px 14px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
        cursor: floating ? 'move' : undefined, touchAction: floating ? 'none' : undefined, userSelect: floating ? 'none' : undefined,
    };

    const panel = (
        <div
            ref={panelRef}
            style={{
                width, maxWidth, height, display: 'flex', flexDirection: 'column',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)', background: '#fff',
                ...(bevel ? { border: '2px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf' } : {}),
                ...(floating ? {
                    position: 'fixed' as const, left: '50%', top: 56,
                    transform: `translate(calc(-50% + ${dragOffset.current.x}px), ${dragOffset.current.y}px)`,
                    zIndex: MODAL_Z[3],
                } : {}),
            }}
            onClick={e => e.stopPropagation()}
        >
            <div style={headerStyle} onPointerDown={floating ? startDrag : undefined}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{title}</span>
                <button
                    onClick={onClose}
                    style={{ background: 'none', border: 'none', color: 'inherit', fontSize: 14, cursor: 'pointer', lineHeight: 1, fontWeight: 'bold' }}
                >
                    {closeGlyph}
                </button>
            </div>
            {children}
        </div>
    );

    // Modeless: no backdrop, background page stays interactive.
    if (floating) return panel;

    return (
        <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: MODAL_Z[3], display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={onClose}
        >
            {panel}
        </div>
    );
}
