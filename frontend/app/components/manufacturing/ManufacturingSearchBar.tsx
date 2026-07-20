import React from 'react';

// Shared search bar for the PR / MO list tabs.
export default function ManufacturingSearchBar({
    value, onChange, placeholder, total, classic,
}: {
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    total: number;
    classic: boolean;
}) {
    return (
        <div className="no-print" style={{
            padding: classic ? '5px 8px' : '8px 12px',
            borderBottom: classic ? '1px solid #808080' : '1px solid #dee2e6',
            background: classic ? '#ece9d8' : '#fff',
            display: 'flex', alignItems: 'center', gap: 8,
        }}>
            <div style={{ position: 'relative', flex: '0 0 320px', maxWidth: '100%' }}>
                <i className="bi bi-search" style={{
                    position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                    fontSize: 11, color: '#888', pointerEvents: 'none',
                }}></i>
                <input
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    style={{
                        width: '100%', padding: '3px 24px 3px 26px',
                        fontFamily: classic ? 'Tahoma, Arial, sans-serif' : undefined,
                        fontSize: classic ? 11 : 13,
                        border: classic ? '1px solid' : '1px solid #ced4da',
                        borderColor: classic ? '#808080 #dfdfdf #dfdfdf #808080' : '#ced4da',
                        borderRadius: classic ? 0 : 4,
                        color: '#000', background: '#fff',
                    }}
                />
                {value && (
                    <button
                        onClick={() => onChange('')}
                        title="Clear search"
                        style={{
                            position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
                            border: 'none', background: 'transparent', cursor: 'pointer',
                            color: '#888', fontSize: 13, lineHeight: 1, padding: '0 4px',
                        }}
                    >x</button>
                )}
            </div>
            {value && (
                <span style={{ fontSize: classic ? 10 : 12, color: '#666' }}>
                    {total} result{total === 1 ? '' : 's'}
                </span>
            )}
        </div>
    );
}
