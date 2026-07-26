'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { ProgressBar } from './xpTheme';

type ToastType = 'success' | 'danger' | 'warning' | 'info' | 'error';

interface Toast {
    id: string;
    message: string;
    type: ToastType;
    /** 0-100 while a long operation runs; null/undefined for a plain toast. */
    progress?: number | null;
    /** Detail line under the message, e.g. "3 of 7 · WIP CBG 9698/22". */
    detail?: string;
    /** Sticky toasts ignore the auto-dismiss timer until they are finished or failed. */
    sticky?: boolean;
}

/**
 * Handle for a single long-running operation's toast. One toast is created up front
 * and mutated in place, instead of emitting a toast per completed unit of work.
 */
export interface ProgressToastHandle {
    /** pct is 0-100. Pass a detail line to describe the current unit of work. */
    update: (pct: number, detail?: string) => void;
    /** Replace with a final success message and start the auto-dismiss timer. */
    finish: (message: string, type?: ToastType) => void;
    /** Replace with a failure message (danger) and start the auto-dismiss timer. */
    fail: (message: string) => void;
}

interface ToastContextType {
    showToast: (message: string, type?: ToastType) => void;
    showProgressToast: (message: string, detail?: string) => ProgressToastHandle;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const AUTO_DISMISS_MS = 4000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const dismissLater = useCallback((id: string) => {
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, AUTO_DISMISS_MS);
    }, []);

    const showToast = useCallback((message: string, type: ToastType = 'info') => {
        const id = Math.random().toString(36).substring(2, 9);
        // Normalize 'error' alias to 'danger' so it renders with danger styling/icon.
        const resolved: ToastType = type === 'error' ? 'danger' : type;
        setToasts((prev) => [...prev, { id, message, type: resolved }]);
        dismissLater(id);
    }, [dismissLater]);

    const showProgressToast = useCallback((message: string, detail?: string): ProgressToastHandle => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts((prev) => [...prev, { id, message, type: 'info', progress: 0, detail, sticky: true }]);

        const patch = (fields: Partial<Toast>) =>
            setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, ...fields } : t)));

        return {
            update: (pct, nextDetail) => patch({
                progress: Math.max(0, Math.min(100, pct)),
                ...(nextDetail !== undefined ? { detail: nextDetail } : {}),
            }),
            finish: (finalMessage, type: ToastType = 'success') => {
                patch({ message: finalMessage, type: type === 'error' ? 'danger' : type, progress: null, detail: undefined, sticky: false });
                dismissLater(id);
            },
            fail: (finalMessage) => {
                patch({ message: finalMessage, type: 'danger', progress: null, detail: undefined, sticky: false });
                dismissLater(id);
            },
        };
    }, [dismissLater]);

    return (
        <ToastContext.Provider value={{ showToast, showProgressToast }}>
            {children}
            <div className="toast-container position-fixed bottom-0 end-0 p-3" style={{ zIndex: 99999 }}>
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        className={`toast show border-0 shadow fade-in mb-2 toast-type-${toast.type}`}
                        role="alert"
                    >
                        <div className="toast-body d-flex align-items-center gap-2">
                            <i className={`bi ${getIcon(toast.type)}`}></i>
                            <div style={{ flex: 1, minWidth: 190 }}>
                                {toast.message}
                                {toast.progress != null && (
                                    <div style={{ marginTop: 4 }}>
                                        <ProgressBar pct={toast.progress} tone="blue" height={10} label="outside" />
                                        {toast.detail && (
                                            <div style={{ fontSize: 10, opacity: 0.8, marginTop: 2 }}>{toast.detail}</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

function getIcon(type: ToastType) {
    switch(type) {
        case 'success': return 'bi-check-circle-fill';
        case 'danger': return 'bi-exclamation-triangle-fill';
        case 'warning': return 'bi-exclamation-circle-fill';
        default: return 'bi-info-circle-fill';
    }
}

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) throw new Error('useToast must be used within ToastProvider');
    return context;
};
