import React from 'react';
import { SearchField, ToolbarCount } from '../shared/shellTheme';

// Shared search bar for the PR / MO list tabs. The field itself is the app-wide
// SearchField — this component only owns the strip it sits in and the result tally.
export default function ManufacturingSearchBar({
    value, onChange, placeholder, total, classic, filters, showCount,
}: {
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    total: number;
    classic: boolean;
    /** Optional filter chips, rendered between the field and the tally. */
    filters?: React.ReactNode;
    /** Force the result tally on when a filter (not the search box) narrows the list. */
    showCount?: boolean;
}) {
    return (
        <div className="no-print" style={{
            padding: classic ? '5px 8px' : '8px 12px',
            borderBottom: classic ? '1px solid #808080' : '1px solid #dee2e6',
            background: classic ? '#ece9d8' : '#fff',
            display: 'flex', alignItems: 'center', gap: 8,
        }}>
            <SearchField classic={classic} value={value} onChange={onChange} placeholder={placeholder} width={320} grow />
            {filters}
            {(value || showCount) && (
                <ToolbarCount classic={classic}>
                    {total} result{total === 1 ? '' : 's'}
                </ToolbarCount>
            )}
        </div>
    );
}
