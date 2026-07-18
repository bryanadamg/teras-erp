'use client';

import React from 'react';
import { useTheme } from '../../context/ThemeContext';

interface PagerProps {
    page: number;
    total: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    /** Render nothing when total is 0 (ManufacturingView's old renderPager did this). Default: always render. */
    hideWhenEmpty?: boolean;
    /** Replaces the default "from-to of total" text — e.g. a selection-count summary. */
    leftContent?: React.ReactNode;
    className?: string;
}

const xpFont = 'Tahoma, Arial, sans-serif';

/**
 * Shared prev/next paginator footer — server-side pagination (page/total/pageSize
 * owned by the caller, e.g. DataContext.pagination). Replaces the hand-rolled
 * pagers previously duplicated per view; branches classic/modern once here.
 */
export default function Pager({ page, total, pageSize, onPageChange, hideWhenEmpty, leftContent, className }: PagerProps) {
    const { uiStyle } = useTheme();
    const classic = uiStyle === 'classic';

    if (hideWhenEmpty && !total) return null;

    const pages = Math.max(1, Math.ceil((total || 0) / pageSize));
    const from = total ? (page - 1) * pageSize + 1 : 0;
    const to = Math.min(page * pageSize, total);
    const atFirst = page <= 1;
    const atLast = page >= pages;

    if (classic) {
        const btn = (label: React.ReactNode, target: number, disabled: boolean) => (
            <button
                disabled={disabled}
                onClick={() => onPageChange(target)}
                style={{
                    fontFamily: xpFont, fontSize: 11, padding: '1px 10px',
                    background: disabled ? '#dcdacc' : 'linear-gradient(to bottom,#f0efe6,#dddbd0)',
                    border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
                    color: disabled ? '#999' : '#000', cursor: disabled ? 'default' : 'pointer',
                }}
            >{label}</button>
        );
        return (
            <div className={`no-print ${className || ''}`} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                padding: '5px 8px', borderTop: '1px solid #808080', background: '#ece9d8',
                fontFamily: xpFont, fontSize: 11,
            }}>
                <span style={{ color: '#444' }}>{leftContent ?? <>{from}-{to} of {total}</>}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {btn(<><i className="bi bi-chevron-left me-1"></i>Prev</>, page - 1, atFirst)}
                    <span style={{ color: '#444' }}>{from}-{to} of {total} &nbsp;·&nbsp; Page {page} / {pages}</span>
                    {btn(<>Next<i className="bi bi-chevron-right ms-1"></i></>, page + 1, atLast)}
                </div>
            </div>
        );
    }

    return (
        <div className={`d-flex justify-content-between align-items-center py-2 px-3 border-top bg-white ${className || ''}`}>
            <div className="small text-muted font-monospace">{leftContent ?? <>Showing {from}-{to} of {total}</>}</div>
            <div className="btn-group">
                <button className={`btn btn-sm btn-light border ${atFirst ? 'disabled opacity-50' : ''}`} onClick={() => onPageChange(page - 1)}>
                    <i className="bi bi-chevron-left me-1"></i>Previous
                </button>
                <div className="btn btn-sm btn-white border-top border-bottom px-3 fw-bold">Page {page} of {pages}</div>
                <button className={`btn btn-sm btn-light border ${atLast ? 'disabled opacity-50' : ''}`} onClick={() => onPageChange(page + 1)}>
                    Next<i className="bi bi-chevron-right ms-1"></i>
                </button>
            </div>
        </div>
    );
}
