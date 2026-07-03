import type React from 'react';
import { xpFont } from '../shared/xpTheme';

// Shared "classic" (Windows XP) chrome for the boxed panels used across the
// Settings tabs — bevel container + colored title bar + data-table look.

export const xpBevel: React.CSSProperties = {
    border: '2px solid',
    borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
    boxShadow: '2px 2px 4px rgba(0,0,0,0.3)',
    background: '#ece9d8',
    borderRadius: 0,
    marginBottom: 16,
};

export const xpTitleBar = (gradient = 'linear-gradient(to right, #0058e6 0%, #08a5ff 100%)', border = '#003080'): React.CSSProperties => ({
    background: gradient,
    color: '#ffffff',
    fontFamily: xpFont,
    fontSize: '12px',
    fontWeight: 'bold',
    padding: '4px 8px',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3)',
    borderBottom: `1px solid ${border}`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: '26px',
});

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
