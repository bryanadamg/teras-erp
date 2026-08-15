import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { MODAL_REPOSITION_EVENT } from './ModalWrapper';
import { layoutRectOf, layoutViewport } from './uiScale';
import { CODE_FONT, xpFont as font } from './xpTheme';

interface Option {
    value: string;
    label: string;
    subLabel?: string;
    category?: string;
}

interface SearchableSelectProps {
    options: Option[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    required?: boolean;
    categories?: string[];
    testId?: string;
    onSearch?: (term: string) => void;
    size?: 'sm' | 'md';
}

const DROPDOWN_MAX_HEIGHT = 280;
// Cap rendered rows to keep the DOM bounded for large lists (combos number in the
// thousands). Anything past the cap is reachable by typing — the footer hint tells
// the user how many are hidden so beyond-cap entries aren't silently unreachable.
const RENDER_CAP = 100;

// A code shown next to the name it duplicates is noise, not information — the
// Combo Library stores name == code for most rows, so the pair rendered the same
// string twice and the fixed-width code squeezed the name into an ellipsis.
const norm = (s?: string) => (s || '').trim().toLowerCase();
const subIsRedundant = (o: Option) =>
    !o.subLabel || !o.label || norm(o.subLabel) === norm(o.label);

export default function SearchableSelect({
    options, value, onChange, placeholder, disabled, className,
    required, categories, testId, onSearch, size = 'md',
}: SearchableSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const [cachedOption, setCachedOption] = useState<Option | null>(null);
    const [dropdownPos, setDropdownPos] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const selectedOption = options.find(o => o.value === value) ?? cachedOption ?? undefined;
    const h = size === 'sm' ? 18 : 20;

    const calcDropdownPos = () => {
        if (!containerRef.current) return;
        // Layout px throughout: these numbers go straight into a fixed-position
        // style, so they must not stay in screen px. See uiScale.ts.
        const rect = layoutRectOf(containerRef.current);
        const viewportH = layoutViewport().height;
        const spaceBelow = viewportH - rect.bottom;
        const spaceAbove = rect.top;
        if (spaceBelow >= DROPDOWN_MAX_HEIGHT || spaceBelow >= spaceAbove) {
            setDropdownPos({ top: rect.bottom, left: rect.left, width: rect.width });
        } else {
            setDropdownPos({ bottom: viewportH - rect.top, left: rect.left, width: rect.width });
        }
    };

    useEffect(() => {
        const onMouseDown = (e: MouseEvent) => {
            const t = e.target as Node;
            const inTrigger = containerRef.current?.contains(t);
            const inDropdown = dropdownRef.current?.contains(t);
            if (!inTrigger && !inDropdown) setIsOpen(false);
        };
        document.addEventListener('mousedown', onMouseDown);
        return () => document.removeEventListener('mousedown', onMouseDown);
    }, []);

    useEffect(() => {
        if (!value) setCachedOption(null);
    }, [value]);

    useEffect(() => {
        if (!isOpen) {
            setSearchTerm('');
            setDropdownPos(null);
            if (onSearch) onSearch('');
        } else {
            calcDropdownPos();
            setTimeout(() => inputRef.current?.focus(), 0);
        }
    }, [isOpen]);

    // Close on scroll outside dropdown, or resize
    useEffect(() => {
        if (!isOpen) return;
        const onScroll = (e: Event) => {
            if (dropdownRef.current?.contains(e.target as Node)) return;
            setIsOpen(false);
        };
        // Reposition (don't close) on resize — a scrollbar toggle from page
        // reflow fires a spurious resize on classic-scrollbar OSes; closing here
        // collapsed the dropdown mid-search. Reposition keeps it glued to trigger.
        const onResize = () => calcDropdownPos();
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', onResize);
        window.addEventListener(MODAL_REPOSITION_EVENT, onResize);
        return () => {
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', onResize);
            window.removeEventListener(MODAL_REPOSITION_EVENT, onResize);
        };
    }, [isOpen]);

    const { filteredOptions, hiddenCount } = useMemo(() => {
        const base = activeCategory ? options.filter(o => o.category === activeCategory) : options;
        const q = searchTerm.toLowerCase();
        const matched = q
            ? base.filter(o =>
                o.label.toLowerCase().includes(q) ||
                (o.subLabel && o.subLabel.toLowerCase().includes(q)))
            : base;
        return {
            filteredOptions: matched.slice(0, RENDER_CAP),
            hiddenCount: Math.max(0, matched.length - RENDER_CAP),
        };
    }, [options, searchTerm, activeCategory]);

    const handleSelect = (val: string) => {
        const opt = options.find(o => o.value === val);
        if (opt) setCachedOption(opt);
        onChange(val);
        setIsOpen(false);
        setSearchTerm('');
    };

    const dropdown = dropdownPos ? (
        <div
            ref={dropdownRef}
            data-testid={testId ? `${testId}-dropdown` : undefined}
            style={{
                position: 'fixed',
                top: dropdownPos.top,
                bottom: dropdownPos.bottom,
                left: dropdownPos.left,
                width: dropdownPos.width,
                minWidth: dropdownPos.width,
                maxWidth: 420,
                background: 'white',
                border: '1px solid #7f9db9',
                boxShadow: '2px 2px 6px rgba(0,0,0,0.28)',
                zIndex: 99999,
                display: 'flex', flexDirection: 'column',
                maxHeight: DROPDOWN_MAX_HEIGHT,
                overflowX: 'hidden',
            }}
            onMouseDown={e => e.stopPropagation()}
        >
            {/* Search row */}
            <div style={{
                padding: '3px 4px',
                borderBottom: '1px solid #c0bdb5',
                background: '#f5f4ee',
                display: 'flex', gap: 4, alignItems: 'center',
                flexShrink: 0,
            }}>
                {categories && categories.length > 0 && (
                    <select
                        style={{
                            fontFamily: font, fontSize: 10,
                            border: '1px solid #7f9db9', height: 18,
                            padding: '0 2px', background: 'white', flexShrink: 0,
                        }}
                        value={activeCategory || ''}
                        onChange={e => setActiveCategory(e.target.value || null)}
                    >
                        <option value="">All</option>
                        {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                )}
                <input
                    ref={inputRef}
                    type="text"
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={e => {
                        setSearchTerm(e.target.value);
                        if (onSearch) onSearch(e.target.value);
                    }}
                    onClick={e => e.stopPropagation()}
                    data-testid={testId ? `${testId}-search` : undefined}
                    style={{
                        fontFamily: font, fontSize: 11,
                        border: '1px solid #7f9db9',
                        borderTopColor: '#5a7fa8',
                        background: 'white',
                        height: 18,
                        padding: '0 4px',
                        outline: 'none',
                        flex: 1,
                        minWidth: 0,
                    }}
                />
            </div>

            {/* Options */}
            <div style={{ overflowY: 'auto', overflowX: 'hidden', flex: 1 }}>
                {filteredOptions.length === 0 ? (
                    <div style={{ padding: '5px 8px', fontSize: 10, color: '#888', fontStyle: 'italic', fontFamily: font }}>
                        No matches found
                    </div>
                ) : (
                    filteredOptions.map(option => {
                        const selected = option.value === value;
                        // A row must never show the same string twice, and the label
                        // must never be starved to an ellipsis by a long subLabel
                        // (combos carry name == code, which did both).
                        const label = option.label || option.subLabel || '';
                        const sub = subIsRedundant(option) ? undefined : option.subLabel;
                        return (
                            <div
                                key={option.value}
                                onClick={() => handleSelect(option.value)}
                                data-testid={testId ? `${testId}-option-${option.value}` : undefined}
                                style={{
                                    display: 'flex', alignItems: 'baseline', gap: 6,
                                    padding: '2px 6px',
                                    cursor: 'pointer',
                                    background: selected ? '#316ac5' : 'white',
                                    color: selected ? 'white' : '#000',
                                    borderBottom: '1px solid #f0efe6',
                                    fontFamily: font, fontSize: 11,
                                    minHeight: 20,
                                }}
                                onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = '#d0e4f8'; }}
                                onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'white'; }}
                            >
                                <span style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {label}
                                </span>
                                {/* subLabel is the option's code — a reference next to its
                                    name, so it renders at the tier-2 code style (muted,
                                    one step down) rather than as its own chip. */}
                                {sub && (
                                    <span style={{
                                        fontFamily: CODE_FONT, fontSize: 9,
                                        color: selected ? 'rgba(255,255,255,0.75)' : '#666',
                                        // Shrinkable and capped: a long code trims itself
                                        // instead of pushing the name out of the row.
                                        flex: '0 1 auto', minWidth: 0, maxWidth: '45%',
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    }}>
                                        {sub}
                                    </span>
                                )}
                                {option.category && (
                                    <span style={{
                                        fontSize: 9,
                                        background: selected ? 'rgba(255,255,255,0.2)' : '#e8e4d8',
                                        color: selected ? '#fff' : '#555',
                                        padding: '0 4px', flexShrink: 0,
                                    }}>
                                        {option.category}
                                    </span>
                                )}
                            </div>
                        );
                    })
                )}
                {hiddenCount > 0 && (
                    <div style={{
                        padding: '3px 8px', fontSize: 9, color: '#666',
                        fontStyle: 'italic', fontFamily: font,
                        background: '#f5f4ee', borderTop: '1px solid #c0bdb5',
                        textAlign: 'center', position: 'sticky', bottom: 0,
                    }}>
                        {hiddenCount} more — type to narrow
                    </div>
                )}
            </div>
        </div>
    ) : null;

    return (
        <div
            ref={containerRef}
            data-testid={testId}
            className={className}
            style={{ position: 'relative', width: '100%' }}
        >
            {/* Trigger */}
            <div
                onClick={() => !disabled && setIsOpen(!isOpen)}
                data-testid={testId ? `${testId}-trigger` : undefined}
                title={selectedOption ? selectedOption.label : (placeholder || 'Select...')}
                role="combobox"
                aria-expanded={isOpen}
                aria-haspopup="listbox"
                style={{
                    position: 'relative',
                    display: 'flex', alignItems: 'center',
                    height: h,
                    fontFamily: font, fontSize: 11,
                    border: '1px solid #7f9db9',
                    borderTopColor: '#5a7fa8', borderLeftColor: '#5a7fa8',
                    background: disabled ? '#f0efe6' : 'white',
                    paddingLeft: 4, paddingRight: 18,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    userSelect: 'none',
                    boxSizing: 'border-box',
                    outline: isOpen ? '1px dotted #316ac5' : 'none',
                    outlineOffset: -2,
                    overflow: 'hidden',
                    color: selectedOption ? '#000' : '#888',
                }}
            >
                <span style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedOption ? (selectedOption.label || selectedOption.subLabel) : (placeholder || 'Select...')}
                </span>
                {selectedOption && !subIsRedundant(selectedOption) && (
                    <span style={{
                        fontFamily: CODE_FONT, fontSize: 9, color: '#666',
                        marginLeft: 5, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80,
                    }}>
                        {selectedOption.subLabel}
                    </span>
                )}
                <div style={{
                    position: 'absolute', right: 0, top: 0, bottom: 0, width: 17,
                    background: 'linear-gradient(to bottom, #f0efe6, #dddbd0)',
                    borderLeft: '1px solid #7f9db9',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, color: '#333', flexShrink: 0,
                    pointerEvents: 'none',
                }}>
                    ▼
                </div>
            </div>

            {/* Hidden input for HTML5 required validation */}
            <input
                tabIndex={-1}
                style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: 0, opacity: 0, pointerEvents: 'none' }}
                value={value}
                onChange={() => {}}
                required={required}
            />

            {/* Portal dropdown — renders on document.body, never clipped */}
            {isOpen && dropdown && typeof document !== 'undefined' && createPortal(dropdown, document.body)}
        </div>
    );
}
