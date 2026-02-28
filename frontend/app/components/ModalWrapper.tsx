'use client';

import React, { useEffect, useState } from 'react';

interface ModalWrapperProps {
    isOpen: boolean;
    onClose: () => void;
    title: React.ReactNode;
    children: React.ReactNode;
    footer?: React.ReactNode;
    level?: 1 | 2 | 3; // Tiered Z-Index: 1 (Primary), 2 (Config), 3 (Alert)
    size?: 'sm' | 'md' | 'lg' | 'xl';
    variant?: 'primary' | 'success' | 'warning' | 'info' | 'danger' | 'dark';
}

/**
 * Industry-standard Unified Modal Wrapper
 * Centralizes full-screen backdrop, z-index hierarchy, and theme styling.
 */
export default function ModalWrapper({ 
    isOpen, 
    onClose, 
    title, 
    children, 
    footer,
    level = 1,
    size = 'md',
    variant = 'primary'
}: ModalWrapperProps) {
    const [currentStyle, setCurrentStyle] = useState('classic');

    useEffect(() => {
        const savedStyle = localStorage.getItem('ui_style');
        if (savedStyle) setCurrentStyle(savedStyle);
    }, []);

    if (!isOpen) return null;

    // Map level to mandated Z-Indices from GEMINI.md
    const zIndices = {
        1: 20000,
        2: 20100,
        3: 20200
    };

    const modalZIndex = zIndices[level];

    // Map variant to Bootstrap background/text classes
    const headerClasses = {
        primary: 'bg-primary bg-opacity-10 text-primary-emphasis',
        success: 'bg-success bg-opacity-10 text-success-emphasis',
        warning: 'bg-warning bg-opacity-10 text-warning-emphasis',
        info: 'bg-info bg-opacity-10 text-info-emphasis',
        danger: 'bg-danger bg-opacity-10 text-danger-emphasis',
        dark: 'bg-dark text-white'
    };

    return (
        <div 
            className="modal d-block" 
            style={{ 
                backgroundColor: 'rgba(0,0,0,0.5)', 
                zIndex: modalZIndex, 
                position: 'fixed', 
                inset: 0,
                backdropFilter: currentStyle === 'modern' ? 'blur(4px)' : 'none'
            }}
            onClick={onClose} // Close on backdrop click (standard ERP behavior)
        >
            <div 
                className={`modal-dialog modal-${size} modal-dialog-centered ui-style-${currentStyle}`}
                onClick={e => e.stopPropagation()} // Prevent closing when clicking inside
            >
                <div className="modal-content shadow-lg border-0 overflow-hidden">
                    <div className={`modal-header py-2 px-3 border-bottom ${headerClasses[variant]}`}>
                        <h5 className="modal-title small fw-bold d-flex align-items-center gap-2">
                            {title}
                        </h5>
                        <button 
                            type="button" 
                            className={`btn-close ${variant === 'dark' ? 'btn-close-white' : ''}`} 
                            onClick={onClose}
                        ></button>
                    </div>
                    
                    <div className="modal-body p-4" style={{ maxHeight: '80vh', overflowY: 'auto' }}>
                        {children}
                    </div>

                    {footer && (
                        <div className="modal-footer bg-light py-2 px-3 border-top">
                            {footer}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
