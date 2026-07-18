import type React from 'react';
import { xpFont } from '../shared/xpTheme';
import { xpBevel as sharedXpBevel, xpTitleBar as sharedXpTitleBar } from '../shared/shellTheme';

// Shared "classic" (Windows XP) chrome for the boxed panels used across the
// Settings tabs — bevel container + colored title bar + data-table look.
// Bevel/title-bar values now come from the app-wide shared shellTheme.tsx
// (same chrome duplicated in ~20 other views) — kept as named re-exports here
// so the 5 Settings tabs importing from this file don't need to change.

export const xpBevel: React.CSSProperties = sharedXpBevel({ marginBottom: 16 });

export const xpTitleBar = (gradient = 'linear-gradient(to right, #0058e6 0%, #08a5ff 100%)', border = '#003080'): React.CSSProperties =>
    sharedXpTitleBar({ background: gradient, borderBottom: `1px solid ${border}` });

export const xpTableHeader: React.CSSProperties = {
    background: 'linear-gradient(to bottom, #ffffff, #d4d0c8)',
    borderBottom: '2px solid #808080',
    fontSize: '10px',
    fontWeight: 'bold',
    color: '#000000',
};

export const xpThCell: React.CSSProperties = {
    padding: '3px 6px',
    borderRight: '1px solid #b0aaa0',
    textAlign: 'left' as const,
    whiteSpace: 'nowrap' as const,
    fontFamily: xpFont,
};

export const tdBase: React.CSSProperties = {
    padding: '4px 6px',
    borderRight: '1px solid #c0bdb5',
    borderBottom: '1px solid #d0cdc8',
    verticalAlign: 'top' as const,
    fontFamily: xpFont,
    fontSize: '11px',
};

export const xpSectionHead: React.CSSProperties = {
    fontFamily: xpFont,
    fontSize: '10px',
    fontWeight: 'bold',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: '#555',
    borderBottom: '1px solid #c0bdb5',
    paddingBottom: 3,
    marginBottom: 8,
};
