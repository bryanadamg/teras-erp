import { useState, useRef, useEffect } from 'react';

interface Option {
    value: string;
    label: string;
    subLabel?: string;
}

interface SearchableSelectProps {
    options: Option[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    required?: boolean;
}

export default function SearchableSelect({ options, value, onChange, placeholder, disabled, className, required }: SearchableSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const selectedOption = options.find(o => o.value === value);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (!isOpen) {
            // Reset search when closing, but keep display value correct
            setSearchTerm('');
        } else if (inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    const filteredOptions = options.filter(option => 
        option.label.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (option.subLabel && option.subLabel.toLowerCase().includes(searchTerm.toLowerCase()))
    ).slice(0, 50); // Limit rendered options for performance

    const handleSelect = (optionValue: string) => {
        onChange(optionValue);
        setIsOpen(false);
        setSearchTerm('');
    };

    return (
        <div className={`position-relative ${className || ''}`} ref={containerRef}>
            <div 
                className={`form-control d-flex align-items-center justify-content-between ${disabled ? 'bg-light' : 'bg-white'} ${isOpen ? 'border-primary ring-2' : ''}`}
                style={{ cursor: disabled ? 'not-allowed' : 'pointer', minHeight: '38px' }}
                onClick={() => !disabled && setIsOpen(!isOpen)}
            >
                <div className="text-truncate">
                    {selectedOption ? (
                        <span>
                            {selectedOption.label} 
                            {selectedOption.subLabel && <small className="text-muted ms-2">({selectedOption.subLabel})</small>}
                        </span>
                    ) : (
                        <span className="text-muted">{placeholder || 'Select...'}</span>
                    )}
                </div>
                <i className="bi bi-chevron-down small text-muted"></i>
            </div>

            {/* Hidden Input for HTML5 Validation */}
            <input 
                tabIndex={-1}
                className="position-absolute opacity-0" 
                style={{bottom: 0, left: 0, width: '100%', height: 0}}
                value={value} 
                onChange={() => {}}
                required={required} 
            />

            {isOpen && (
                <div className="position-absolute top-100 start-0 w-100 bg-white border rounded shadow-sm mt-1 z-3" style={{maxHeight: '250px', overflowY: 'auto'}}>
                    <div className="p-2 border-bottom sticky-top bg-white">
                        <input
                            ref={inputRef}
                            type="text"
                            className="form-control form-control-sm"
                            placeholder="Search..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                    {filteredOptions.length > 0 ? (
                        filteredOptions.map((option) => (
                            <div 
                                key={option.value}
                                className={`px-3 py-2 cursor-pointer ${option.value === value ? 'bg-primary text-white' : 'hover-bg-light text-dark'}`}
                                onClick={() => handleSelect(option.value)}
                                style={{cursor: 'pointer'}}
                            >
                                <div className="fw-medium">{option.label}</div>
                                {option.subLabel && <div className={`small ${option.value === value ? 'text-white-50' : 'text-muted'}`}>{option.subLabel}</div>}
                            </div>
                        ))
                    ) : (
                        <div className="p-3 text-center text-muted small">No matches found</div>
                    )}
                </div>
            )}
        </div>
    );
}
