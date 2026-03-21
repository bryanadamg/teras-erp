'use client';

import { useParams, useRouter } from 'next/navigation';
import { getPageBySlug, docsSidebar } from '../docsContent';

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
                        <p style={{ color: '#334', fontSize: 13, lineHeight: 1.7, marginBottom: section.items ? 10 : 0 }}>
                            {section.body}
                        </p>
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
                        ← {prev.icon} {prev.label}
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
                        {next.icon} {next.label} →
                    </button>
                ) : <div />}
            </div>
        </div>
    );
}
