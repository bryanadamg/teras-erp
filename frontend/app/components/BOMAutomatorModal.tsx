import { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';

interface AutoBOMProfile {
    id: string;
    name: string;
    levels: string[][];
}

interface BOMAutomatorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onApply: (levels: string[][]) => void;
}

export default function BOMAutomatorModal({ isOpen, onClose, onApply }: BOMAutomatorModalProps) {
    const { t } = useLanguage();
    // Default structure
    const defaultLevels = [['WIP CBG {CODE}'], ['WIP CSBG {CODE}'], ['WIP WARPING {CODE}']];
    const [levels, setLevels] = useState<string[][]>(defaultLevels);
    const [profiles, setProfiles] = useState<AutoBOMProfile[]>([]);
    const [profileName, setProfileName] = useState('');
    const [currentStyle, setCurrentStyle] = useState('default');

    useEffect(() => {
        const savedProfiles = localStorage.getItem('bom_auto_profiles');
        if (savedProfiles) {
            try {
                setProfiles(JSON.parse(savedProfiles));
            } catch (e) {
                console.error("Invalid profiles in localstorage");
            }
        }
        
        // Load the last active levels if available, or default
        const lastLevels = localStorage.getItem('bom_auto_levels_active');
        if (lastLevels) {
            try {
                setLevels(JSON.parse(lastLevels));
            } catch (e) {}
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

    const handleSaveProfile = () => {
        if (!profileName.trim()) return;
        const newProfile: AutoBOMProfile = {
            id: Math.random().toString(36).substr(2, 9),
            name: profileName,
            levels: levels
        };
        const updatedProfiles = [...profiles, newProfile];
        setProfiles(updatedProfiles);
        localStorage.setItem('bom_auto_profiles', JSON.stringify(updatedProfiles));
        setProfileName('');
    };

    const handleLoadProfile = (profile: AutoBOMProfile) => {
        setLevels(profile.levels);
    };

    const handleDeleteProfile = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const updatedProfiles = profiles.filter(p => p.id !== id);
        setProfiles(updatedProfiles);
        localStorage.setItem('bom_auto_profiles', JSON.stringify(updatedProfiles));
    };

    const handleSaveAndApply = () => {
        localStorage.setItem('bom_auto_levels_active', JSON.stringify(levels));
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
                            <div className="bg-primary rounded-circle d-flex align-items-center justify-content-center me-3 shadow-sm" style={{ width: '32px', height: '32px' }}>
                                <i className="bi bi-magic text-white fs-6"></i>
                            </div>
                            BOM Automation Wizard
                        </h5>
                        <button type="button" className="btn-close btn-close-white opacity-75" onClick={onClose}></button>
                    </div>
                    
                    <div className="modal-body p-0" style={{ maxHeight: '75vh', overflowY: 'auto', backgroundColor: '#f8f9fa' }}>
                        
                        {/* Profile Management Section */}
                        <div className="p-4 bg-light border-bottom">
                            <h6 className="extra-small fw-bold text-uppercase text-muted mb-3 letter-spacing-1">
                                <i className="bi bi-folder2-open me-2"></i>Configuration Profiles
                            </h6>
                            <div className="row g-3">
                                <div className="col-md-7">
                                    <div className="d-flex flex-wrap gap-2">
                                        {profiles.map(p => (
                                            <div key={p.id} className="btn-group btn-group-sm mb-1 shadow-xs">
                                                <button className="btn btn-white border text-dark px-3" onClick={() => handleLoadProfile(p)}>
                                                    {p.name}
                                                </button>
                                                <button className="btn btn-white border-start-0 border text-danger opacity-75 hover-opacity-100" onClick={(e) => handleDeleteProfile(e, p.id)}>
                                                    <i className="bi bi-x"></i>
                                                </button>
                                            </div>
                                        ))}
                                        {profiles.length === 0 && <span className="text-muted small italic py-1">No saved profiles yet.</span>}
                                    </div>
                                </div>
                                <div className="col-md-5">
                                    <div className="input-group input-group-sm shadow-xs">
                                        <input 
                                            type="text" 
                                            className="form-control" 
                                            placeholder="Profile Name..." 
                                            value={profileName}
                                            onChange={e => setProfileName(e.target.value)}
                                        />
                                        <button className="btn btn-primary" type="button" onClick={handleSaveProfile} disabled={!profileName.trim()}>
                                            <i className="bi bi-cloud-arrow-up-fill me-1"></i>Save New
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 bg-white border-bottom shadow-sm">
                            <p className="text-secondary mb-4 small">
                                Configure naming patterns per processing level. Use <code>{'{CODE}'}</code> as a placeholder for the parent item code.
                                The system will generate multiple items per level to build your structural tree.
                            </p>

                            <div className="bg-light rounded p-3 border shadow-sm">
                                <h6 className="extra-small fw-bold text-uppercase text-muted mb-3 letter-spacing-1">
                                    <i className="bi bi-diagram-3 me-2"></i>Branching Preview
                                </h6>
                                <div className="font-monospace small overflow-auto py-2" style={{ maxHeight: '200px' }}>
                                    <div className="d-flex align-items-center mb-2">
                                        <div className="bg-primary bg-opacity-10 text-primary px-2 py-1 rounded border border-primary border-opacity-25 fw-bold shadow-xs">
                                            {dummyCode} <span className="opacity-50 fw-normal ms-1">(Root)</span>
                                        </div>
                                    </div>
                                    {levels.map((lvl, lIdx) => (
                                        <div key={lIdx} style={{ paddingLeft: `${(lIdx + 1) * 24}px` }} className="border-start border-2 border-primary border-opacity-10 my-1">
                                            {lvl.map((p, pIdx) => (
                                                <div key={pIdx} className="d-flex align-items-center gap-2 mb-1">
                                                    <span className="text-primary opacity-25">├──</span>
                                                    <span className="bg-white text-dark px-2 py-1 border rounded shadow-xs" style={{ fontSize: '0.7rem', minWidth: '120px' }}>
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
                                        
                                        <div className="card shadow-sm border-primary border-opacity-10 overflow-hidden">
                                            <div className="card-header bg-primary bg-opacity-10 py-2 px-3 d-flex justify-content-between align-items-center border-0">
                                                <div className="d-flex align-items-center">
                                                    <span className="badge bg-primary text-white me-2 shadow-xs">L{lIdx + 1}</span>
                                                    <span className="small fw-bold text-primary-emphasis">Processing Level</span>
                                                </div>
                                                <button 
                                                    className="btn btn-sm btn-link text-danger p-0 opacity-75 hover-opacity-100" 
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
                                                            <span className="input-group-text bg-light border-end-0 text-muted shadow-inner" style={{ width: '35px' }}>{pIdx + 1}</span>
                                                            <input 
                                                                type="text" 
                                                                className="form-control border-primary border-opacity-10" 
                                                                value={pattern} 
                                                                onChange={(e) => handlePatternChange(lIdx, pIdx, e.target.value)}
                                                                placeholder="Pattern e.g. WIP {CODE}"
                                                            />
                                                            {lvl.length > 1 && (
                                                                <button className="btn btn-outline-danger border-primary border-opacity-10" onClick={() => removePatternFromLevel(lIdx, pIdx)}>
                                                                    <i className="bi bi-dash-lg"></i>
                                                                </button>
                                                            )}
                                                        </div>
                                                    ))}
                                                    <button className="btn btn-sm btn-link text-primary text-decoration-none p-0 mt-1 d-flex align-items-center small fw-bold" onClick={() => addPatternToLevel(lIdx)}>
                                                        <i className="bi bi-plus-circle-fill me-2"></i> Add branching item to this level
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                
                                <div className="text-center py-2">
                                    <button className="btn btn-sm btn-outline-primary border-dashed px-4 py-2 bg-primary bg-opacity-5 rounded-pill shadow-xs" onClick={addLevel} style={{ borderStyle: 'dashed' }}>
                                        <i className="bi bi-plus-lg me-2"></i>Add Next Structural Level
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="modal-footer bg-white border-top p-3 px-4 shadow-lg">
                        <button type="button" className="btn btn-link text-muted text-decoration-none small" onClick={onClose}>{t('cancel')}</button>
                        <button type="button" className="btn btn-primary text-white fw-bold px-5 shadow rounded-pill" onClick={handleSaveAndApply}>
                            <i className="bi bi-lightning-charge-fill me-2"></i>Generate Tree Structure
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
