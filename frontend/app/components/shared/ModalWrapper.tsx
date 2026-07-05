'use client';

import React, { useState, useRef, useEffect, useId } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useIsMobile } from '../../hooks/useIsMobile';

// Shared z-index tier for anything that must render as an overlay but can't use
// ModalWrapper directly (e.g. a full-screen designer canvas with its own custom
// chrome) — keeps it in the same stacking order as regular modals instead of an
// arbitrary one-off number.
export const MODAL_Z = { 1: 20000, 2: 20100, 3: 20200 } as const;

// Fired on every drag-move of a modeless modal panel. The panel's position is
// updated by mutating the DOM transform directly (no React re-render, no native
// resize/scroll event) — anything anchoring a portaled overlay to the panel
// (e.g. SearchableSelect, TreeSelect dropdowns) must listen for this to stay glued.
export const MODAL_REPOSITION_EVENT = 'terras-modal-reposition';

// Stack of open modals so Escape only closes the topmost one (nested levels 1-3).
const escStack: Array<() => void> = [];
let escListenerAttached = false;

function ensureEscListener() {
    if (escListenerAttached || typeof window === 'undefined') return;
    escListenerAttached = true;
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && escStack.length > 0) {
            e.stopPropagation();
            escStack[escStack.length - 1]();
        }
    });
}

interface ModalWrapperProps {
    isOpen: boolean;
    onClose: () => void;
    title: React.ReactNode;
    children: React.ReactNode;
    footer?: React.ReactNode;
    level?: 1 | 2 | 3;
    size?: 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
    variant?: 'primary' | 'success' | 'warning' | 'info' | 'danger' | 'dark';
    /**
     * Modeless window: no backdrop, background page stays interactive,
     * panel is draggable by its title bar. Ignored on mobile (falls back
     * to a normal blocking modal). Use for creation/edit forms; keep
     * confirmations and destructive dialogs blocking.
     */
    modeless?: boolean;
}

const xpTitleGradients: Record<string, string> = {
    primary: 'linear-gradient(to right, #0058e6 0%, #08a5ff 100%)',
    success: 'linear-gradient(to right, #1a6e1a 0%, #3ab83a 100%)',
    warning: 'linear-gradient(to right, #8e5000 0%, #c87c00 100%)',
    info:    'linear-gradient(to right, #006e8e 0%, #00a8c8 100%)',
    danger:  'linear-gradient(to right, #8e0000 0%, #c84040 100%)',
    dark:    'linear-gradient(to right, #1a1a2e 0%, #3a3a5e 100%)',
};

const xpTitleBorders: Record<string, string> = {
    primary: '#003080', success: '#0a4e0a', warning: '#5e3000',
    info: '#004a5e', danger: '#5e0000', dark: '#0a0a1e',
};

const xpSizeWidths: Record<string, number> = { sm: 340, md: 480, lg: 640, xl: 820, xxl: 1100 };

export default function ModalWrapper({
    isOpen, onClose, title, children, footer,
    level = 1, size = 'md', variant = 'primary', modeless = false
}: ModalWrapperProps) {
    const { uiStyle: currentStyle } = useTheme();
    const isMobile = useIsMobile();
    const [closeBtnHov, setCloseBtnHov] = useState(false);
    const backdropMouseDown = useRef(false);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    const panelRef = useRef<HTMLDivElement>(null);
    const dragOffset = useRef({ x: 0, y: 0 });

    const floating = modeless && !isMobile;
    const titleId = useId();

    useEffect(() => {
        if (!isOpen) return;
        ensureEscListener();
        const close = () => onCloseRef.current();
        escStack.push(close);
        return () => {
            const idx = escStack.indexOf(close);
            if (idx !== -1) escStack.splice(idx, 1);
        };
    }, [isOpen]);

    // Reset drag position each time the window is reopened
    useEffect(() => {
        if (!isOpen) dragOffset.current = { x: 0, y: 0 };
    }, [isOpen]);

    // Focus trap: move focus into the dialog on open, cycle Tab/Shift+Tab within
    // it, restore focus to whatever was focused before on close. Without this,
    // keyboard users can tab straight through to background page content.
    const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    useEffect(() => {
        if (!isOpen) return;
        const previouslyFocused = document.activeElement as HTMLElement | null;
        const getFocusable = () => panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? null;

        const raf = requestAnimationFrame(() => {
            const items = getFocusable();
            if (items && items.length > 0) items[0].focus();
            else panelRef.current?.focus();
        });

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Tab') return;
            const items = getFocusable();
            if (!items || items.length === 0) { e.preventDefault(); return; }
            const first = items[0], last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            previouslyFocused?.focus?.();
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const modalZIndex = MODAL_Z[level];

    // Drag updates the DOM node directly — no React re-renders during pointermove,
    // transform is compositor-only, so this stays smooth on old hardware.
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

    const floatingPos: React.CSSProperties = {
        position: 'fixed',
        left: '50%',
        top: 56,
        transform: `translate(calc(-50% + ${dragOffset.current.x}px), ${dragOffset.current.y}px)`,
        zIndex: modalZIndex,
        // The panel can render as a direct child of a Bootstrap .row, whose
        // `.row > *` rule injects gutter padding/margin — neutralize it.
        padding: 0,
        margin: 0,
    };

    // ── XP Dialog ──────────────────────────────────────────────────────────
    if (currentStyle === 'classic') {
        const dialog = (
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                style={{
                    width: xpSizeWidths[size] || 480, maxWidth: '96vw',
                    border: '2px solid',
                    borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
                    boxShadow: floating ? '5px 5px 16px rgba(0,0,0,0.45)' : '4px 4px 12px rgba(0,0,0,0.55)',
                    background: '#ece9d8',
                    borderRadius: 0,
                    display: 'flex', flexDirection: 'column',
                    maxHeight: floating ? 'calc(100vh - 80px)' : '92vh',
                    ...(floating ? floatingPos : {}),
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* XP Title Bar */}
                <div
                    onPointerDown={floating ? startDrag : undefined}
                    style={{
                        background: xpTitleGradients[variant] || xpTitleGradients.primary,
                        color: '#ffffff',
                        fontFamily: 'Tahoma, Arial, sans-serif',
                        fontSize: '12px', fontWeight: 'bold',
                        padding: '4px 6px 4px 8px',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3)',
                        borderBottom: `1px solid ${xpTitleBorders[variant] || '#003080'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        minHeight: '26px', gap: 6,
                        userSelect: 'none' as const,
                        flexShrink: 0,
                        cursor: floating ? 'move' : undefined,
                        touchAction: floating ? 'none' : undefined,
                    }}>
                    <span id={titleId} style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                        {title}
                    </span>
                    <button
                        onClick={onClose}
                        onMouseEnter={() => setCloseBtnHov(true)}
                        onMouseLeave={() => setCloseBtnHov(false)}
                        style={{
                            fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px', fontWeight: 'bold',
                            width: 21, height: 21, minWidth: 21, cursor: 'pointer',
                            background: closeBtnHov
                                ? 'linear-gradient(to bottom, #e8a0a0, #c84040)'
                                : 'linear-gradient(to bottom, #d4c8c8, #a89898)',
                            border: '1px solid',
                            borderColor: closeBtnHov ? '#8e0000 #5e0000 #5e0000 #8e0000' : '#dfdfdf #808080 #808080 #dfdfdf',
                            color: '#ffffff', borderRadius: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            lineHeight: 1, flexShrink: 0,
                            textShadow: '0 1px 1px rgba(0,0,0,0.5)',
                        }}
                        title="Close"
                        aria-label="Close"
                    >✕</button>
                </div>

                {/* Body — ui-style-classic triggers CSS overrides for Bootstrap controls */}
                <div
                    className="ui-style-classic"
                    style={{ padding: '12px 14px', overflowY: 'auto', background: 'linear-gradient(to bottom, #f1efe5 0%, #e5e2d3 100%)', flex: 1 }}
                >
                    {children}
                </div>

                {/* Footer */}
                {footer && (
                    <div style={{
                        background: 'linear-gradient(to bottom, #f5f4ef, #e0dfd8)',
                        borderTop: '1px solid #b0a898',
                        padding: '6px 10px',
                        display: 'flex', justifyContent: 'flex-end', gap: 4,
                        flexShrink: 0,
                    }}>
                        {footer}
                    </div>
                )}
            </div>
        );

        if (floating) return dialog;

        return (
            <div
                style={{
                    position: 'fixed', inset: 0, zIndex: modalZIndex,
                    backgroundColor: 'rgba(0,0,0,0.45)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onMouseDown={e => { backdropMouseDown.current = e.target === e.currentTarget; }}
                onClick={() => { if (backdropMouseDown.current) onClose(); }}
            >
                {dialog}
            </div>
        );
    }

    // ── Modern (Bootstrap) ──────────────────────────────────────────────────
    const headerClasses: Record<string, string> = {
        primary: 'bg-primary bg-opacity-10 text-primary-emphasis',
        success: 'bg-success bg-opacity-10 text-success-emphasis',
        warning: 'bg-warning bg-opacity-10 text-warning-emphasis',
        info:    'bg-info bg-opacity-10 text-info-emphasis',
        danger:  'bg-danger bg-opacity-10 text-danger-emphasis',
        dark:    'bg-dark text-white',
    };

    const modernContent = (
        <div className="modal-content shadow-lg border-0" role="dialog" aria-modal="true" aria-labelledby={titleId} style={{ overflow: 'visible' }}>
            <div
                className={`modal-header py-2 px-3 border-bottom ${headerClasses[variant]}`}
                style={{ borderRadius: '0.5rem 0.5rem 0 0', cursor: floating ? 'move' : undefined, touchAction: floating ? 'none' : undefined, userSelect: floating ? 'none' : undefined }}
                onPointerDown={floating ? startDrag : undefined}
            >
                <h5 id={titleId} className="modal-title small fw-bold d-flex align-items-center gap-2">{title}</h5>
                <button type="button" className={`btn-close ${variant === 'dark' ? 'btn-close-white' : ''}`} onClick={onClose} aria-label="Close"></button>
            </div>
            <div className="modal-body p-4" style={{ maxHeight: floating ? 'calc(100vh - 160px)' : '85vh', overflowY: 'auto', background: 'white' }}>
                {children}
            </div>
            {footer && (
                <div className="modal-footer bg-light py-2 px-3 border-top" style={{ borderRadius: '0 0 0.5rem 0.5rem' }}>{footer}</div>
            )}
        </div>
    );

    if (floating) {
        const widths: Record<string, number> = { sm: 320, md: 520, lg: 760, xl: 960, xxl: 1100 };
        return (
            <div ref={panelRef} tabIndex={-1} style={{ ...floatingPos, width: widths[size] || 520, maxWidth: '96vw', outline: 'none' }}>
                {modernContent}
            </div>
        );
    }

    return (
        <div
            className="modal d-block"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: modalZIndex, position: 'fixed', inset: 0, backdropFilter: 'blur(4px)' }}
            onMouseDown={e => { backdropMouseDown.current = e.target === e.currentTarget; }}
            onClick={() => { if (backdropMouseDown.current) onClose(); }}
        >
            <div ref={panelRef} tabIndex={-1} className={`modal-dialog modal-${size === 'xxl' ? 'xl' : size} modal-dialog-centered`} style={size === 'xxl' ? { maxWidth: 1100, outline: 'none' } : { outline: 'none' }} onClick={e => e.stopPropagation()}>
                {modernContent}
            </div>
        </div>
    );
}
