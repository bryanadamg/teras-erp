'use client';
import React from 'react';
import { xpFont, FORM_SECTION_BLUE } from './xpTheme';

// ─────────────────────────────────────────────────────────────────────────────
// Shared expanded-row detail panel for request-style pages (Sample Requests,
// Lab Dip Requests). Renders the classic-XP / modern two-pane layout:
//   LEFT  — a fixed-column table of the request's variants/colors
//   RIGHT — an optional header control + grouped label/value sections
// Each page supplies its own column cells and section fields; this component owns
// the layout and both light themes so the two pages stay visually identical.
// ─────────────────────────────────────────────────────────────────────────────

export interface DetailColumn {
    header: React.ReactNode;
    width?: number;                         // fixed px width (via <colgroup>); omit → flexible
    align?: 'left' | 'center' | 'right';
}

export interface DetailRow {
    key: string;
    stripeColor?: string;                   // classic: colored left border on the first cell
    background?: string;                    // row background tint (per status)
    cells: React.ReactNode[];               // one entry per column
}

export interface DetailField {
    label: React.ReactNode;
    value: React.ReactNode;
    full?: boolean;                         // span both grid columns
}

export interface DetailSection {
    title: React.ReactNode;
    fields: DetailField[];
}

// Status → left-border + row-background tint. Superset covering both pages.
export const getStatusStripe = (status: string): { borderLeftColor: string; background: string } => {
    const map: Record<string, { borderLeftColor: string; background: string }> = {
        PENDING:       { borderLeftColor: '#9e9e9e', background: '#fdfdfd' },
        IN_PROGRESS:   { borderLeftColor: '#c77800', background: '#fffdf8' },
        IN_PRODUCTION: { borderLeftColor: '#c77800', background: '#fffdf8' },
        SENT:          { borderLeftColor: '#3a5faa', background: '#f8faff' },
        APPROVED:      { borderLeftColor: '#27713a', background: '#f8fff8' },
        REJECTED:      { borderLeftColor: '#a01a1a', background: '#fff8f8' },
    };
    return map[status] || map.PENDING;
};

interface Props {
    classic: boolean;
    leftTitle: React.ReactNode;
    leftWidth?: string;                     // default '56%'
    columns: DetailColumn[];
    rows: DetailRow[];
    emptyText?: string;
    sections: DetailSection[];
    rightHeader?: React.ReactNode;          // optional control strip above the sections
    minHeight?: number;                     // default 160 (ignored when `height` is set)
    height?: number;                        // fixed panel height; panes scroll internally past it
}

export default function RequestDetailPanel({
    classic, leftTitle, leftWidth = '56%', columns, rows, emptyText = 'No rows.', sections, rightHeader, minHeight = 160, height,
}: Props) {

    // A fixed height clamps the panel and lets each pane scroll its own overflow;
    // otherwise it grows with content (minHeight floor). `overflow: hidden` keeps
    // the inner scroll areas — not the page — owning the overflow.
    const sizing: React.CSSProperties = height != null ? { height, overflow: 'hidden', boxSizing: 'border-box' } : { minHeight };
    const outer: React.CSSProperties = classic
        ? { background: '#ece9d8', borderTop: '2px solid #0058e6', display: 'flex', ...sizing }
        : { background: '#f8f9fa', borderTop: '2px solid #0d6efd', display: 'flex', ...sizing };

    // min-width: 0 stops each pane's intrinsic content width from propagating up into
    // the outer (auto-layout) list table and resizing its flexible columns on expand.
    // min-height: 0 lets the panes scroll within a fixed-height panel.
    const leftPane: React.CSSProperties = {
        width: leftWidth, borderRight: classic ? '1px solid #a0988c' : '1px solid #dee2e6',
        display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0,
    };

    const leftHeader: React.CSSProperties = classic
        ? { background: 'linear-gradient(to bottom, #e4e1d8, #d5d2c8)', borderBottom: '1px solid #9a9690', padding: '2px 8px', fontSize: 10, fontWeight: 'bold', color: '#111', letterSpacing: '0.3px', display: 'flex', alignItems: 'center', gap: 6, fontFamily: xpFont, flexShrink: 0 }
        : { background: '#f1f3f5', borderBottom: '1px solid #dee2e6', padding: '3px 8px', fontSize: 10, fontWeight: 600, color: '#495057', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 };

    const thCell: React.CSSProperties = classic
        ? { background: 'linear-gradient(to bottom, #f0ede8, #e4e1da)', borderBottom: '1px solid #b0a898', borderRight: '1px solid #ccc', fontSize: 9, fontWeight: 'bold', color: '#111', padding: '2px 6px', textAlign: 'left', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.3px', fontFamily: xpFont }
        : { background: '#fff', borderBottom: '1px solid #dee2e6', padding: '2px 6px', fontSize: 10, fontWeight: 600, color: '#333', textAlign: 'left', whiteSpace: 'nowrap' };

    const tdBase: React.CSSProperties = classic
        ? { padding: '3px 6px', borderBottom: '1px solid #e8e5e0', borderRight: '1px solid #e0ddd8', fontSize: 11, verticalAlign: 'middle', fontFamily: xpFont }
        : { padding: '4px 6px', borderBottom: '1px solid #e9ecef', fontSize: 11, verticalAlign: 'middle' };

    const rightPane: React.CSSProperties = { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 };

    const grpHdr: React.CSSProperties = classic
        ? { background: FORM_SECTION_BLUE, color: '#fff', fontSize: 10, fontWeight: 'bold', padding: '2px 8px', letterSpacing: '0.4px', textTransform: 'uppercase', fontFamily: xpFont }
        : { background: '#e9ecef', color: '#333', fontSize: 10, fontWeight: 600, padding: '3px 8px', borderBottom: '1px solid #dee2e6', borderTop: '1px solid #dee2e6' };

    const grpBody: React.CSSProperties = {
        background: '#fff', padding: '6px 10px', borderBottom: classic ? '1px solid #d0cdc8' : '1px solid #dee2e6',
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: classic ? '2px 20px' : '2px 16px',
    };

    const lbl: React.CSSProperties = classic
        ? { fontFamily: xpFont, fontSize: 10, color: '#333', fontWeight: 'bold', minWidth: 90, flexShrink: 0 }
        : { fontSize: 10, color: '#444', fontWeight: 600, minWidth: 88, flexShrink: 0 };
    const val: React.CSSProperties = classic
        ? { fontFamily: xpFont, fontSize: 11, color: '#000' }
        : { fontSize: 11, color: '#111' };

    return (
        <div style={outer}>
            {/* LEFT — variant/color table */}
            <div style={leftPane}>
                <div style={leftHeader}>{leftTitle}</div>
                {rows.length > 0 ? (
                    <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                            <colgroup>
                                {columns.map((col, i) => <col key={i} style={col.width ? { width: col.width } : undefined} />)}
                            </colgroup>
                            <thead>
                                <tr>
                                    {columns.map((col, i) => (
                                        <th key={i} style={{ ...thCell, textAlign: col.align || 'left', ...(i === columns.length - 1 ? { borderRight: 'none' } : {}) }}>
                                            {col.header}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row, ri) => {
                                    const isLast = ri === rows.length - 1;
                                    return (
                                        <tr key={row.key} style={{ background: row.background }}>
                                            {row.cells.map((cell, ci) => {
                                                const col = columns[ci];
                                                const style: React.CSSProperties = {
                                                    ...tdBase,
                                                    background: row.background,
                                                    textAlign: col?.align || 'left',
                                                    ...(isLast ? { borderBottom: 'none' } : {}),
                                                    ...(ci === columns.length - 1 ? { borderRight: 'none' } : {}),
                                                    ...(ci === 0 && classic && row.stripeColor ? { borderLeft: `4px solid ${row.stripeColor}` } : {}),
                                                };
                                                return <td key={ci} style={style}>{cell}</td>;
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div style={{ padding: '12px 10px', color: '#555', fontStyle: 'italic', fontSize: classic ? 10 : 11, fontFamily: classic ? xpFont : undefined }}>{emptyText}</div>
                )}
            </div>

            {/* RIGHT — optional control strip + grouped sections */}
            <div style={rightPane}>
                {rightHeader}
                {sections.map((sec, si) => (
                    <div key={si}>
                        <div style={grpHdr}>{sec.title}</div>
                        <div style={grpBody}>
                            {sec.fields.map((f, fi) => (
                                <div key={fi} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', ...(f.full ? { gridColumn: '1 / -1' } : {}) }}>
                                    <span style={lbl}>{f.label}</span>
                                    <span style={{ ...val, ...(f.full ? { whiteSpace: 'pre-wrap' as const } : {}) }}>{f.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
