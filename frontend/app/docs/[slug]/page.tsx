'use client';

import { useParams, useRouter } from 'next/navigation';
import { getPageBySlug, docsSidebar } from '../docsContent';
import { CODE_FONT } from '../../components/shared/xpTheme';

export default function DocsPage() {
    const { slug } = useParams<{ slug: string }>();
    const router = useRouter();
    const page = getPageBySlug(slug);

    if (!page) {
        return (
            <div>
                <h2 style={{ color: '#1a3fa8', borderBottom: '2px solid #2563c4', paddingBottom: 8, marginBottom: 16 }}>
                    Page Not Found
                </h2>
                <p style={{ color: '#555', fontSize: 13 }}>
                    The documentation page <strong>{slug}</strong> does not exist.{' '}
                    <span
                        style={{ color: '#1a5cb8', cursor: 'pointer', textDecoration: 'underline' }}
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
        <div style={{ maxWidth: 760 }}>
            {/* Title */}
            <div style={{ marginBottom: 20 }}>
                <h1 style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: '#1a3fa8',
                    borderBottom: '2px solid #2563c4',
                    paddingBottom: 10,
                    marginBottom: 6,
                }}>
                    {page.title}
                </h1>
                <p style={{ color: '#556b8a', fontSize: 13, marginBottom: 10 }}>{page.subtitle}</p>

                {/* Badges */}
                {page.badges && page.badges.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {page.badges.map(b => (
                            <span key={b} style={{
                                background: '#e8f0fe',
                                border: '1px solid #aaccee',
                                color: '#1a3fa8',
                                fontSize: 11,
                                padding: '2px 8px',
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
                <div key={i} style={{ marginBottom: 28 }}>
                    <h2 style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color: '#1a3070',
                        marginBottom: 8,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                    }}>
                        <span style={{
                            display: 'inline-block',
                            width: 4,
                            height: 16,
                            background: 'linear-gradient(to bottom, #2563c4, #1a3fa8)',
                            borderRadius: 2,
                            flexShrink: 0,
                        }} />
                        {section.heading}
                    </h2>

                    {section.body && (
                        <p style={{ color: '#334', fontSize: 13, lineHeight: 1.7, marginBottom: 10, whiteSpace: 'pre-line' }}>
                            {section.body}
                        </p>
                    )}

                    {section.callout && (
                        <div style={{
                            margin: '8px 0 10px',
                            padding: '10px 14px',
                            borderLeft: `3px solid ${section.callout.type === 'warning' ? '#e08030' : section.callout.type === 'tip' ? '#2aa060' : '#2563c4'}`,
                            background: section.callout.type === 'warning' ? '#fff8f0' : section.callout.type === 'tip' ? '#f0faf4' : '#f0f6ff',
                            borderRadius: '0 4px 4px 0',
                            fontSize: 13,
                            color: '#334',
                            lineHeight: 1.6,
                        }}>
                            <strong style={{ color: section.callout.type === 'warning' ? '#b05010' : section.callout.type === 'tip' ? '#1a7a48' : '#1a3fa8', marginRight: 6 }}>
                                {section.callout.type === 'warning' ? 'Note:' : section.callout.type === 'tip' ? 'Tip:' : 'Info:'}
                            </strong>
                            {section.callout.text}
                        </div>
                    )}

                    {section.code && (
                        <pre style={{
                            background: '#1e2533',
                            color: '#c8d8f0',
                            fontSize: 12,
                            lineHeight: 1.6,
                            padding: '12px 16px',
                            borderRadius: 4,
                            overflowX: 'auto',
                            margin: '8px 0 10px',
                            fontFamily: CODE_FONT,
                            border: '1px solid #0a1428',
                        }}>
                            {section.code}
                        </pre>
                    )}

                    {section.table && (
                        <div style={{ overflowX: 'auto', margin: '8px 0 10px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <thead>
                                    <tr style={{ background: 'linear-gradient(to bottom, #2a6fd4, #1a3fa8)' }}>
                                        {section.table.headers.map((h, j) => (
                                            <th key={j} style={{
                                                padding: '7px 12px',
                                                color: '#fff',
                                                fontWeight: 700,
                                                textAlign: 'left',
                                                borderRight: j < section.table!.headers.length - 1 ? '1px solid #3a80e4' : 'none',
                                                whiteSpace: 'nowrap',
                                            }}>
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {section.table.rows.map((row, ri) => (
                                        <tr key={ri} style={{ background: ri % 2 === 0 ? '#f5f8ff' : '#fff', borderBottom: '1px solid #d8e8f8' }}>
                                            {row.map((cell, ci) => (
                                                <td key={ci} style={{
                                                    padding: '6px 12px',
                                                    color: '#334',
                                                    borderRight: ci < row.length - 1 ? '1px solid #d8e8f8' : 'none',
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
                                    color: '#334',
                                    lineHeight: 1.6,
                                    padding: '8px 12px',
                                    background: '#f5f8ff',
                                    border: '1px solid #d4e4f8',
                                    borderRadius: 4,
                                }}>
                                    <span style={{
                                        minWidth: 22,
                                        height: 22,
                                        background: 'linear-gradient(to bottom, #2a6fd4, #1a3fa8)',
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
                                    border: '1px solid #d4e4f8',
                                    borderRadius: 4,
                                    overflow: 'hidden',
                                }}>
                                    <div style={{
                                        background: 'linear-gradient(to bottom, #2a6fd4, #1a3fa8)',
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
                                                color: '#334',
                                                padding: '5px 12px',
                                                borderBottom: ii < col.items.length - 1 ? '1px solid #e8f0f8' : 'none',
                                                background: ii % 2 === 0 ? '#f5f8ff' : '#fff',
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
                                    color: '#334',
                                    lineHeight: 1.6,
                                    padding: '4px 0',
                                    borderBottom: j < section.items!.length - 1 ? '1px solid #e8f0f8' : 'none',
                                }}>
                                    <span style={{
                                        color: '#2563c4',
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
                borderTop: '1px solid #c8dff0',
            }}>
                {prev ? (
                    <button
                        onClick={() => router.push(`/docs/${prev.slug}`)}
                        style={{
                            background: 'linear-gradient(to bottom, #e8f0fe, #d4e4f8)',
                            border: '1px solid #aaccee',
                            borderRadius: 3,
                            color: '#1a3fa8',
                            fontSize: 12,
                            padding: '5px 14px',
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
                            background: 'linear-gradient(to bottom, #2a6fd4, #1a3fa8)',
                            border: '1px solid #0a246a',
                            borderRadius: 3,
                            color: 'white',
                            fontSize: 12,
                            padding: '5px 14px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                        }}
                    >
                        <i className={`bi ${next.icon}`} /> {next.label} →
                    </button>
                ) : <div />}
            </div>
        </div>
    );
}
