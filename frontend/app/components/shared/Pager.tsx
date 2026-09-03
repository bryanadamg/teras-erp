'use client';

import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { lvBtn, LV_XP_FONT, LV_MODERN_FONT } from './listViewTheme';
import { XP_BTN } from './xpTheme';

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

    // Prev/Next use the shared lvBtn look (same button family as every list-view
    // toolbar) so the pager reads as part of the same button system, not a one-off.
    const navBtn = (label: React.ReactNode, target: number, disabled: boolean) => (
        <button
            type="button"
            className={XP_BTN}
            disabled={disabled}
            onClick={() => onPageChange(target)}
            style={lvBtn(classic, 'default', disabled ? { opacity: 0.5, cursor: 'default' } : {})}
        >{label}</button>
    );

    if (classic) {
        return (
            <div className={`no-print ${className || ''}`} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                padding: '5px 8px', borderTop: '1px solid #808080', background: '#ece9d8',
                fontFamily: LV_XP_FONT, fontSize: 11,
            }}>
                <span style={{ color: '#444' }}>{leftContent ?? <>{from}-{to} of {total}</>}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {navBtn(<><i className="bi bi-chevron-left me-1"></i>Prev</>, page - 1, atFirst)}
                    <span style={{ color: '#444' }}>Page {page} / {pages}</span>
                    {navBtn(<>Next<i className="bi bi-chevron-right ms-1"></i></>, page + 1, atLast)}
                </div>
            </div>
        );
    }

    return (
        <div className={`no-print ${className || ''}`} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            padding: '6px 10px', borderTop: '1px solid #dbe1ea', background: '#fff',
            fontFamily: LV_MODERN_FONT, fontSize: 12, color: '#475569',
        }}>
            <span>{leftContent ?? <>Showing {from}-{to} of {total}</>}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {navBtn(<><i className="bi bi-chevron-left me-1"></i>Previous</>, page - 1, atFirst)}
                <span>Page {page} of {pages}</span>
                {navBtn(<>Next<i className="bi bi-chevron-right ms-1"></i></>, page + 1, atLast)}
            </div>
        </div>
    );
}
