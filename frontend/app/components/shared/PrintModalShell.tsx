'use client';
import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { MODAL_Z } from './ModalWrapper';

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
    bevel = true, closeGlyph = 'X',
}: PrintModalShellProps) {
    const { uiStyle } = useTheme();
    const classic = uiStyle === 'classic';

    const headerStyle: React.CSSProperties = classic ? {
        background: 'linear-gradient(to right, #0058e6 0%, #08a5ff 100%)', color: '#fff',
        fontFamily: 'Tahoma, Arial, sans-serif', fontSize: 12, fontWeight: 'bold',
        padding: '4px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
    } : {
        background: '#0d6efd', color: '#fff', padding: '10px 14px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
    };

    return (
        <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: MODAL_Z[3], display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={onClose}
        >
            <div
                style={{
                    width, maxWidth, height, display: 'flex', flexDirection: 'column',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)', background: '#fff',
                    ...(bevel ? { border: '2px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf' } : {}),
                }}
                onClick={e => e.stopPropagation()}
            >
                <div style={headerStyle}>
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
        </div>
    );
}
