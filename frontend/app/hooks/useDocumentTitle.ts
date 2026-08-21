'use client';

import { useEffect } from 'react';

/**
 * Stamps the browser tab title as "<page> · <app name>".
 *
 * Operators keep several Terras tabs open side by side (a work queue on one, the
 * SO it feeds on another), so the page name leads: a narrow tab strip truncates
 * the tail, and it is the page half that has to survive.
 *
 * Pass a nullish title to leave document.title alone — used where a nested
 * layout owns the title itself (the docs pages), since child effects run before
 * the parent's and would otherwise be overwritten.
 */
export function useDocumentTitle(pageTitle: string | null | undefined, appName?: string) {
    useEffect(() => {
        if (!pageTitle) return;
        let name = appName;
        // Same override the sidebar/header shell reads; falls back to the brand.
        if (!name) { try { name = localStorage.getItem('app_name') || undefined; } catch {} }
        document.title = `${pageTitle} · ${name || 'Terras ERP'}`;
    }, [pageTitle, appName]);
}
