import { useCallback, useRef, useState, useEffect } from 'react';

/**
 * page/total bookkeeping shared by every server-paginated domain in
 * DataContext (items, MOs, PRs, audit-logs, stock-ledger, sales-orders).
 * Deliberately just page+total — the fetch URL, response shape, and any
 * extra filters stay in DataContext itself, since those genuinely differ
 * per domain (slim mode, race-guard generations, category/status filters).
 */
export function usePageState() {
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    return { page, setPage, total, setTotal };
}

/**
 * Debounced-commit shape shared by every text search box that drives a
 * server fetch: the input echoes instantly, the committed value (which
 * triggers the actual request) only updates after a quiet period, and
 * committing always resets to page 1.
 *
 * `setPage` is optional — audit/report-style pages that don't have their
 * own dedicated search box don't need it wired.
 */
export function useDebouncedSearch(setPage?: (p: number) => void, delayMs = 350) {
    const [input, setInput] = useState('');
    const [committed, setCommitted] = useState('');
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const setSearch = useCallback((v: string) => {
        setInput(v);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => { setCommitted(v); setPage?.(1); }, delayMs);
    }, [setPage, delayMs]);

    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

    return { input, committed, setSearch };
}
