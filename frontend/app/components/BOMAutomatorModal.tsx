import { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';

interface BOMAutomatorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onApply: (patterns: string[]) => void;
}

export default function BOMAutomatorModal({ isOpen, onClose, onApply }: BOMAutomatorModalProps) {
    const { t } = useLanguage();
    const [patterns, setPatterns] = useState<string[]>(['WIP CBG {CODE}', 'WIP CSBG {CODE}', 'WIP WARPING {CODE}']);
    const [currentStyle, setCurrentStyle] = useState('default');

    useEffect(() => {
        const savedPatterns = localStorage.getItem('bom_auto_patterns');
        if (savedPatterns) {
            try {
                setPatterns(JSON.parse(savedPatterns));
            } catch (e) {
                console.error("Invalid patterns in localstorage");
            }
        }
        const savedStyle = localStorage.getItem('ui_style');
        if (savedStyle) setCurrentStyle(savedStyle);
    }, [isOpen]);

    if (!isOpen) return null;

    const handlePatternChange = (index: number, value: string) => {
        const newPatterns = [...patterns];
        newPatterns[index] = value;
        setPatterns(newPatterns);
    };

    const addPattern = () => {
        setPatterns([...patterns, '']);
    };

    const removePattern = (index: number) => {
        setPatterns(patterns.filter((_, i) => i !== index));
    };

    const handleSaveAndApply = () => {
        localStorage.setItem('bom_auto_patterns', JSON.stringify(patterns));
        onApply(patterns);
        onClose();
    };

    const dummyCode = "9698/22";

    return (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1070 }}>
            <div className={`modal-dialog modal-dialog-centered ui-style-${currentStyle}`}>
                <div className="modal-content shadow">
                    <div className="modal-header bg-info bg-opacity-10 text-info-emphasis">
                        <h5 className="modal-title"><i className="bi bi-magic me-2"></i>BOM Automation Wizard</h5>
                        <button type="button" className="btn-close" onClick={onClose}></button>
                    </div>
                    <div className="modal-body">
                        <p className="text-muted small">
                            Define a naming pattern to automatically build nested BOMs. 
                            Use <code>{'{CODE}'}</code> as a placeholder for the Item Code.
                            The system will chain these items together top-down.
                        </p>

                        <div className="mb-3 border rounded p-3 bg-light">
                            <h6 className="small fw-bold text-uppercase text-muted mb-2">Structure Preview</h6>
                            <div className="font-monospace small">
                                <div className="fw-bold text-primary">1. {dummyCode} (Finished Good)</div>
                                {patterns.map((p, i) => (
                                    <div key={i} style={{ paddingLeft: `${(i + 1) * 12}px` }}>
                                        ↳ {p.replace('{CODE}', dummyCode) || '(undefined)'}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="d-flex flex-column gap-2">
                            {patterns.map((pattern, index) => (
                                <div key={index} className="input-group input-group-sm">
                                    <span className="input-group-text" style={{width: '30px'}}>{index + 1}</span>
                                    <input 
                                        type="text" 
                                        className="form-control" 
                                        value={pattern} 
                                        onChange={(e) => handlePatternChange(index, e.target.value)}
                                        placeholder="e.g. WIP {CODE}"
                                    />
                                    <button className="btn btn-outline-danger" onClick={() => removePattern(index)}><i className="bi bi-trash"></i></button>
                                </div>
                            ))}
                            <button className="btn btn-sm btn-light border text-primary dashed-border mt-2" onClick={addPattern}>
                                <i className="bi bi-plus-lg me-1"></i>Add Level
                            </button>
                        </div>
                    </div>
                    <div className="modal-footer bg-light">
                        <button type="button" className="btn btn-sm btn-secondary" onClick={onClose}>{t('cancel')}</button>
                        <button type="button" className="btn btn-sm btn-info fw-bold px-4" onClick={handleSaveAndApply}>
                            <i className="bi bi-lightning-charge-fill me-1"></i>Auto-Build
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
