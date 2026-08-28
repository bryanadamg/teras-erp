'use client';

import { useParams, useRouter } from 'next/navigation';
import { getPageBySlug, docsSidebar } from '../docsContent';
import { CODE_FONT } from '../../components/shared/xpTheme';
import { DOCS_COLORS as C } from '../layout';

const CALLOUT_TONE: Record<'info' | 'tip' | 'warning', { border: string; bg: string; label: string; text: string }> = {
    info: { border: '#4a90d9', bg: 'rgba(74,144,217,0.12)', label: 'Info', text: '#9dc4f0' },
    tip: { border: '#3ecf8e', bg: 'rgba(62,207,142,0.1)', label: 'Tip', text: '#7fe0b4' },
    warning: { border: '#e8b03a', bg: 'rgba(232,176,58,0.12)', label: 'Note', text: '#f0c868' },
};

export default function DocsPage() {
    const { slug } = useParams<{ slug: string }>();
    const router = useRouter();
    const page = getPageBySlug(slug);

    if (!page) {
        return (
            <div>
                <h2 style={{ color: C.bright, borderBottom: `2px solid ${C.accent}`, paddingBottom: 8, marginBottom: 16 }}>
                    Page Not Found
                </h2>
                <p style={{ color: C.body, fontSize: 13 }}>
                    The documentation page <strong>{slug}</strong> does not exist.{' '}
                    <span
                        style={{ color: '#9dc4f0', cursor: 'pointer', textDecoration: 'underline' }}
                        onClick={() => router.push('/docs/overview')}
                    >
                        Return to Overview
                    </span>
                </p>
            </div>
        );
    }

    // Build prev/next navigation
    const allItems = docsSidebar.flatMap(s => s.items);
    const currentIdx = allItems.findIndex(i => i.slug === slug);
    const prev = currentIdx > 0 ? allItems[currentIdx - 1] : null;
    const next = currentIdx < allItems.length - 1 ? allItems[currentIdx + 1] : null;

    return (
        <div style={{ maxWidth: 780 }}>
            {/* Title */}
            <div style={{ marginBottom: 24 }}>
                <h1 style={{
                    fontSize: 24,
                    fontWeight: 700,
                    color: C.bright,
                    borderBottom: `2px solid ${C.accent}`,
                    paddingBottom: 12,
                    marginBottom: 8,
                }}>
                    {page.title}
                </h1>
                <p style={{ color: C.muted, fontSize: 13.5, marginBottom: 10 }}>{page.subtitle}</p>

                {/* Badges */}
                {page.badges && page.badges.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {page.badges.map(b => (
                            <span key={b} style={{
                                background: 'rgba(255,255,255,0.06)',
                                border: `1px solid ${C.border}`,
                                color: C.body,
                                fontSize: 11,
                                padding: '2px 9px',
                                borderRadius: 3,
                                fontWeight: 600,
                            }}>
                                {b}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Sections */}
            {page.sections.map((section, i) => (
                <div key={i} style={{ marginBottom: 30 }}>
                    <h2 style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color: C.bright,
                        marginBottom: 10,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                    }}>
                        <span style={{
                            display: 'inline-block',
                            width: 4,
                            height: 16,
                            background: `linear-gradient(to bottom, ${C.accent}, ${C.accentDark})`,
                            borderRadius: 2,
                            flexShrink: 0,
                        }} />
                        {section.heading}
                    </h2>

                    {section.body && (
                        <p style={{ color: C.body, fontSize: 13, lineHeight: 1.7, marginBottom: 10, whiteSpace: 'pre-line' }}>
                            {section.body}
                        </p>
                    )}

                    {section.callout && (
                        <div style={{
                            margin: '8px 0 10px',
                            padding: '10px 14px',
                            borderLeft: `3px solid ${CALLOUT_TONE[section.callout.type].border}`,
                            background: CALLOUT_TONE[section.callout.type].bg,
                            borderRadius: '0 4px 4px 0',
                            fontSize: 13,
                            color: C.body,
                            lineHeight: 1.6,
                        }}>
                            <strong style={{ color: CALLOUT_TONE[section.callout.type].text, marginRight: 6 }}>
                                {CALLOUT_TONE[section.callout.type].label}:
                            </strong>
                            {section.callout.text}
                        </div>
                    )}

                    {section.code && (
                        <pre style={{
                            background: 'rgba(0,6,26,0.55)',
                            color: '#bcd4f5',
                            fontSize: 12,
                            lineHeight: 1.6,
                            padding: '12px 16px',
                            borderRadius: 4,
                            overflowX: 'auto',
                            margin: '8px 0 10px',
                            fontFamily: CODE_FONT,
                            border: `1px solid ${C.border}`,
                        }}>
                            {section.code}
                        </pre>
                    )}

                    {section.table && (
                        <div style={{ overflowX: 'auto', margin: '8px 0 10px', border: `1px solid ${C.border}`, borderRadius: 4 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <thead>
                                    <tr style={{ background: `linear-gradient(to bottom, ${C.accent}, ${C.accentDark})` }}>
                                        {section.table.headers.map((h, j) => (
                                            <th key={j} style={{
                                                padding: '7px 12px',
                                                color: '#fff',
                                                fontWeight: 700,
                                                textAlign: 'left',
                                                borderRight: j < section.table!.headers.length - 1 ? '1px solid rgba(255,255,255,0.2)' : 'none',
                                                whiteSpace: 'nowrap',
                                            }}>
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {section.table.rows.map((row, ri) => (
                                        <tr key={ri} style={{ background: ri % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'transparent' }}>
                                            {row.map((cell, ci) => (
                                                <td key={ci} style={{
                                                    padding: '6px 12px',
                                                    color: C.body,
                                                    borderRight: ci < row.length - 1 ? `1px solid ${C.border}` : 'none',
                                                    borderTop: `1px solid ${C.border}`,
                                                    fontWeight: cell.startsWith('**') ? 700 : 400,
                                                }}>
                                                    {cell.replace(/\*\*/g, '')}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {section.steps && (
                        <ol style={{ margin: '8px 0 10px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {section.steps.map((step, j) => (
                                <li key={j} style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: 10,
                                    fontSize: 13,
                                    color: C.body,
                                    lineHeight: 1.6,
                                    padding: '9px 12px',
                                    background: C.panel,
                                    border: `1px solid ${C.border}`,
                                    borderRadius: 4,
                                }}>
                                    <span style={{
                                        minWidth: 22,
                                        height: 22,
                                        background: `linear-gradient(to bottom, ${C.accent}, ${C.accentDark})`,
                                        color: '#fff',
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 11,
                                        fontWeight: 700,
                                        flexShrink: 0,
                                    }}>
                                        {j + 1}
                                    </span>
                                    {step}
                                </li>
                            ))}
                        </ol>
                    )}

                    {section.columns && (
                        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${section.columns.length}, 1fr)`, gap: 10, margin: '8px 0 10px' }}>
                            {section.columns.map((col, ci) => (
                                <div key={ci} style={{
                                    border: `1px solid ${C.border}`,
                                    borderRadius: 4,
                                    overflow: 'hidden',
                                }}>
                                    <div style={{
                                        background: `linear-gradient(to bottom, ${C.accent}, ${C.accentDark})`,
                                        color: '#fff',
                                        fontSize: 12,
                                        fontWeight: 700,
                                        padding: '6px 12px',
                                    }}>
                                        {col.label}
                                    </div>
                                    <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                                        {col.items.map((item, ii) => (
                                            <li key={ii} style={{
                                                fontSize: 12,
                                                color: C.body,
                                                padding: '5px 12px',
                                                borderBottom: ii < col.items.length - 1 ? `1px solid ${C.border}` : 'none',
                                                background: ii % 2 === 0 ? C.panel : 'transparent',
                                                lineHeight: 1.5,
                                            }}>
                                                {item}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    )}

                    {section.items && (
                        <ul style={{ margin: '0 0 0 4px', padding: 0, listStyle: 'none' }}>
                            {section.items.map((item, j) => (
                                <li key={j} style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: 8,
                                    fontSize: 13,
                                    color: C.body,
                                    lineHeight: 1.6,
                                    padding: '5px 0',
                                    borderBottom: j < section.items!.length - 1 ? `1px solid ${C.border}` : 'none',
                                }}>
                                    <span style={{
                                        color: C.accent,
                                        fontWeight: 700,
                                        flexShrink: 0,
                                        marginTop: 2,
                                    }}>▸</span>
                                    {item}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            ))}

            {/* Prev / Next navigation */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: 40,
                paddingTop: 16,
                borderTop: `1px solid ${C.border}`,
            }}>
                {prev ? (
                    <button
                        onClick={() => router.push(`/docs/${prev.slug}`)}
                        style={{
                            background: 'rgba(255,255,255,0.06)',
                            border: `1px solid ${C.border}`,
                            borderRadius: 4,
                            color: C.body,
                            fontSize: 12,
                            padding: '6px 14px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                        }}
                    >
                        ← <i className={`bi ${prev.icon}`} /> {prev.label}
                    </button>
                ) : <div />}

                {next ? (
                    <button
                        onClick={() => router.push(`/docs/${next.slug}`)}
                        style={{
                            background: `linear-gradient(to bottom, ${C.accent}, ${C.accentDark})`,
                            border: '1px solid #0a246a',
                            borderRadius: 4,
                            color: 'white',
                            fontSize: 12,
                            padding: '6px 14px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
                        }}
                    >
                        <i className={`bi ${next.icon}`} /> {next.label} →
                    </button>
                ) : <div />}
            </div>
        </div>
    );
}
