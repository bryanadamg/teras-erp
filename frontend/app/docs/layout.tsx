'use client';

import { usePathname, useRouter } from 'next/navigation';
import { docsSidebar } from './docsContent';

export default function DocsLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();

    const currentSlug = pathname.split('/docs/')[1] ?? 'overview';

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
            fontSize: 13,
            background: '#d4e8f8',
            overflow: 'hidden',
        }}>
            {/* Header */}
            <div style={{
                background: 'linear-gradient(to bottom, #2a6fd4, #1a3fa8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 20px',
                height: 48,
                flexShrink: 0,
                boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 20 }}>📋</span>
                    <div>
                        <div style={{ color: 'white', fontWeight: 700, fontSize: 15, letterSpacing: 0.5 }}>
                            Teras ERP — Help &amp; Documentation
                        </div>
                        <div style={{ color: '#a0c2f5', fontSize: 11 }}>
                            Manufacturing &amp; Inventory Management System
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <button
                        onClick={() => router.push('/login')}
                        style={{
                            background: 'rgba(255,255,255,0.15)',
                            border: '1px solid rgba(255,255,255,0.3)',
                            borderRadius: 3,
                            color: 'white',
                            fontSize: 11,
                            padding: '3px 12px',
                            cursor: 'pointer',
                        }}
                    >
                        ← Sign In
                    </button>
                </div>
            </div>

            {/* Body */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                {/* Sidebar */}
                <div style={{
                    width: 220,
                    flexShrink: 0,
                    background: 'linear-gradient(to bottom, #c4d8ee, #b8ccdf)',
                    borderRight: '1px solid #9ab8d4',
                    overflowY: 'auto',
                    padding: '8px 0',
                }}>
                    {docsSidebar.map(section => (
                        <div key={section.title}>
                            <div style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: '#1a3fa8',
                                textTransform: 'uppercase',
                                letterSpacing: 1,
                                padding: '10px 12px 4px',
                            }}>
                                {section.title}
                            </div>
                            {section.items.map(item => {
                                const isActive = item.slug === currentSlug;
                                return (
                                    <div
                                        key={item.slug}
                                        onClick={() => router.push(`/docs/${item.slug}`)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 7,
                                            padding: '5px 14px',
                                            cursor: 'pointer',
                                            fontSize: 12,
                                            color: isActive ? 'white' : '#1a3070',
                                            background: isActive
                                                ? 'linear-gradient(to right, #1a4ab8, #2563c4)'
                                                : 'transparent',
                                            borderLeft: isActive ? '3px solid #7ab0f0' : '3px solid transparent',
                                            fontWeight: isActive ? 600 : 400,
                                            transition: 'background 0.1s',
                                        }}
                                        onMouseEnter={e => {
                                            if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(26,63,168,0.12)';
                                        }}
                                        onMouseLeave={e => {
                                            if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent';
                                        }}
                                    >
                                        <span style={{ fontSize: 14 }}>{item.icon}</span>
                                        {item.label}
                                    </div>
                                );
                            })}
                        </div>
                    ))}

                    {/* Divider + version */}
                    <div style={{ borderTop: '1px solid #9ab8d4', margin: '12px 0' }} />
                    <div style={{ padding: '0 14px', fontSize: 10, color: '#6a8ab0' }}>
                        Teras ERP v2.0<br />
                        Help &amp; Documentation
                    </div>
                </div>

                {/* Content area */}
                <div style={{
                    flex: 1,
                    background: 'white',
                    overflowY: 'auto',
                    padding: '28px 36px',
                }}>
                    {children}
                </div>
            </div>
        </div>
    );
}
