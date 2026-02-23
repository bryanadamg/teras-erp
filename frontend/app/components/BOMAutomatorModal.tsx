import { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';

interface BOMAutomatorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onApply: (levels: string[][]) => void;
}

export default function BOMAutomatorModal({ isOpen, onClose, onApply }: BOMAutomatorModalProps) {
    const { t } = useLanguage();
    // Default: 3 levels, each with 1 pattern
    const [levels, setLevels] = useState<string[][]>([['WIP CBG {CODE}'], ['WIP CSBG {CODE}'], ['WIP WARPING {CODE}']]);
    const [currentStyle, setCurrentStyle] = useState('default');

    useEffect(() => {
        const savedLevels = localStorage.getItem('bom_auto_levels');
        if (savedLevels) {
            try {
                const parsed = JSON.parse(savedLevels);
                if (Array.isArray(parsed) && Array.isArray(parsed[0])) {
                    setLevels(parsed);
                } else if (Array.isArray(parsed)) {
                    // Migration for old single-string array format
                    setLevels(parsed.map(p => [p]));
                }
            } catch (e) {
                console.error("Invalid patterns in localstorage");
            }
        }
        const savedStyle = localStorage.getItem('ui_style');
        if (savedStyle) setCurrentStyle(savedStyle);
    }, [isOpen]);

    if (!isOpen) return null;

    const handlePatternChange = (lIdx: number, pIdx: number, value: string) => {
        const newLevels = [...levels];
        newLevels[lIdx][pIdx] = value;
        setLevels(newLevels);
    };

    const addLevel = () => {
        setLevels([...levels, ['']]);
    };

    const removeLevel = (index: number) => {
        setLevels(levels.filter((_, i) => i !== index));
    };

    const addPatternToLevel = (lIdx: number) => {
        const newLevels = [...levels];
        newLevels[lIdx].push('');
        setLevels(newLevels);
    };

    const removePatternFromLevel = (lIdx: number, pIdx: number) => {
        const newLevels = [...levels];
        newLevels[lIdx] = newLevels[lIdx].filter((_, i) => i !== pIdx);
        setLevels(newLevels);
    };

    const handleSaveAndApply = () => {
        localStorage.setItem('bom_auto_levels', JSON.stringify(levels));
        onApply(levels);
        onClose();
    };

    const dummyCode = "9698/22";

    return (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1070, backdropFilter: 'blur(4px)' }}>
            <div className={`modal-dialog modal-lg modal-dialog-centered ui-style-${currentStyle}`}>
                <div className="modal-content border-0 shadow-2xl overflow-hidden" style={{ borderRadius: currentStyle === 'classic' ? '0' : '12px' }}>
                    <div className="modal-header bg-dark text-white border-0 py-3">
                        <h5 className="modal-title d-flex align-items-center">
                            <div className="bg-info rounded-circle d-flex align-items-center justify-content-center me-3" style={{ width: '32px', height: '32px' }}>
                                <i className="bi bi-magic text-white fs-6"></i>
                            </div>
                            BOM Automation Wizard
                        </h5>
                        <button type="button" className="btn-close btn-close-white opacity-75" onClick={onClose}></button>
                    </div>
                    
                    <div className="modal-body p-0" style={{ maxHeight: '75vh', overflowY: 'auto', backgroundColor: '#f8f9fa' }}>
                        <div className="p-4 bg-white border-bottom shadow-sm">
                            <p className="text-secondary mb-4 small">
                                Configure naming patterns per processing level. Use <code>{'{CODE}'}</code> as a placeholder for the parent item code.
                                The system will generate multiple items per level to build your structural tree.
                            </p>

                            <div className="bg-light rounded p-3 border">
                                <h6 className="extra-small fw-bold text-uppercase text-muted mb-3 letter-spacing-1">
                                    <i className="bi bi-diagram-3 me-2"></i>Branching Preview
                                </h6>
                                <div className="font-monospace small overflow-auto py-2" style={{ maxHeight: '180px' }}>
                                    <div className="d-flex align-items-center mb-2">
                                        <div className="bg-primary bg-opacity-10 text-primary px-2 py-1 rounded border border-primary border-opacity-25 fw-bold">
                                            {dummyCode} <span className="opacity-50 fw-normal ms-1">(Root)</span>
                                        </div>
                                    </div>
                                    {levels.map((lvl, lIdx) => (
                                        <div key={lIdx} className="ps-4 border-start border-2 border-info border-opacity-25 ms-3 py-1 my-1">
                                            {lvl.map((p, pIdx) => (
                                                <div key={pIdx} className="d-flex align-items-center gap-2 mb-1">
                                                    <span className="text-info opacity-50">├──</span>
                                                    <span className="bg-white text-dark px-2 py-0 border rounded shadow-xs" style={{ fontSize: '0.75rem' }}>
                                                        {p.replace('{CODE}', dummyCode) || '...'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="p-4">
                            <div className="d-flex flex-column gap-4">
                                {levels.map((lvl, lIdx) => (
                                    <div key={lIdx} className="position-relative">
                                        {/* Connector Line */}
                                        {lIdx > 0 && (
                                            <div className="position-absolute start-50 top-0 translate-middle-x" style={{ height: '24px', width: '2px', backgroundColor: '#dee2e6', marginTop: '-24px' }}></div>
                                        )}
                                        
                                        <div className="card shadow-sm border-info border-opacity-10 overflow-hidden">
                                            <div className="card-header bg-info bg-opacity-10 py-2 px-3 d-flex justify-content-between align-items-center border-0">
                                                <div className="d-flex align-items-center">
                                                    <span className="badge bg-info text-white me-2">L{lIdx + 1}</span>
                                                    <span className="small fw-bold text-info-emphasis">Processing Level</span>
                                                </div>
                                                <button 
                                                    className="btn btn-sm btn-link text-danger p-0" 
                                                    onClick={() => removeLevel(lIdx)} 
                                                    title="Delete level"
                                                >
                                                    <i className="bi bi-trash"></i>
                                                </button>
                                            </div>
                                            <div className="card-body p-3 bg-white">
                                                <div className="d-flex flex-column gap-2">
                                                    {lvl.map((pattern, pIdx) => (
                                                        <div key={pIdx} className="input-group input-group-sm">
                                                            <span className="input-group-text bg-light border-end-0 text-muted" style={{ width: '35px' }}>{pIdx + 1}</span>
                                                            <input 
                                                                type="text" 
                                                                className="form-control" 
                                                                value={pattern} 
                                                                onChange={(e) => handlePatternChange(lIdx, pIdx, e.target.value)}
                                                                placeholder="Pattern e.g. WIP {CODE}"
                                                            />
                                                            {lvl.length > 1 && (
                                                                <button className="btn btn-outline-danger" onClick={() => removePatternFromLevel(lIdx, pIdx)}>
                                                                    <i className="bi bi-dash-lg"></i>
                                                                </button>
                                                            )}
                                                        </div>
                                                    ))}
                                                    <button className="btn btn-sm btn-link text-info text-decoration-none p-0 mt-1 d-flex align-items-center small" onClick={() => addPatternToLevel(lIdx)}>
                                                        <i className="bi bi-plus-circle-fill me-2"></i> Add branching item to this level
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                
                                <div className="text-center py-2">
                                    <button className="btn btn-sm btn-outline-primary border-dashed px-4 py-2 bg-primary bg-opacity-5" onClick={addLevel} style={{ borderStyle: 'dashed' }}>
                                        <i className="bi bi-plus-lg me-2"></i>Add Next Structural Level
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="modal-footer bg-white border-top p-3 px-4 shadow-lg">
                        <button type="button" className="btn btn-link text-muted text-decoration-none small" onClick={onClose}>{t('cancel')}</button>
                        <button type="button" className="btn btn-info text-white fw-bold px-5 shadow-sm rounded-pill" onClick={handleSaveAndApply}>
                            <i className="bi bi-lightning-charge-fill me-2"></i>Generate Tree Structure
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
