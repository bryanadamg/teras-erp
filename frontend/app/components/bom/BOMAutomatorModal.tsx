import React, { useState, useEffect, useCallback, memo } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useData } from '../../context/DataContext';
import ModalWrapper from '../shared/ModalWrapper';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api')
    .replace(/\/api$/, '') + '/api';

interface AutoBOMProfile {
    id: string;
    name: string;
    levels: string[][];
    inherit_attributes?: boolean[] | null;
}

interface BOMAutomatorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onApply: (levels: string[][], inheritAttributes: boolean[]) => void;
    /** Human-readable list of the root BOM's assigned attribute values, e.g.
     *  "Combo: Navy Stripe". Empty when the root has none — the inherit checkboxes
     *  then have nothing to offer and are disabled. */
    rootAttributeSummary?: string;
}

const DUMMY_CODE = "9698/22";
const DEFAULT_LEVELS = [['WIP CBG {CODE}'], ['WIP CSBG {CODE}'], ['WIP WARPING {CODE}']];
// Attribute inheritance is opt-in per level: a generated child carries no Combo/
// attribute value unless its level is explicitly ticked.
const DEFAULT_INHERIT = DEFAULT_LEVELS.map(() => false);

// Pads/trims a stored flag list to match the level count. Legacy profiles have none.
const normalizeInherit = (flags: boolean[] | null | undefined, levelCount: number): boolean[] =>
    Array.from({ length: levelCount }, (_, i) => !!flags?.[i]);

// --- XP style helpers ---
const xpBtn: React.CSSProperties = {
    fontFamily: 'Tahoma, "Segoe UI", sans-serif',
    fontSize: 11,
    padding: '2px 10px',
    background: 'linear-gradient(to bottom, #f0efe6, #dddbd0)',
    borderTop: '1px solid #fff',
    borderLeft: '1px solid #fff',
    borderRight: '1px solid #555',
    borderBottom: '1px solid #555',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    minWidth: 60,
    color: '#000',
};

const xpBtnPrimary: React.CSSProperties = {
    ...xpBtn,
    background: 'linear-gradient(to bottom, #b4d0f8, #7aacf0)',
    borderTopColor: '#c8e0ff',
    borderLeftColor: '#c8e0ff',
    fontWeight: 'bold',
    color: '#00007a',
    minWidth: 80,
};

const xpBtnDanger: React.CSSProperties = {
    ...xpBtn,
    background: 'linear-gradient(to bottom, #f8d0d0, #e0a0a0)',
    color: '#800000',
    minWidth: 'auto',
    padding: '1px 6px',
    fontSize: 10,
};

const xpInput: React.CSSProperties = {
    fontFamily: 'Tahoma, "Segoe UI", sans-serif',
    fontSize: 11,
    border: '1px solid #7f9db9',
    borderTopColor: '#5a7fa8',
    background: 'white',
    height: 20,
    padding: '0 4px',
    outline: 'none',
    width: '100%',
};

const xpGroupbox = (label: string): { wrapper: React.CSSProperties; labelStyle: React.CSSProperties } => ({
    wrapper: {
        border: '1px solid #aca899',
        borderRadius: 3,
        padding: '12px 8px 8px',
        background: '#f5f4ee',
        position: 'relative',
        marginBottom: 6,
    },
    labelStyle: {
        position: 'absolute',
        top: -8,
        left: 8,
        background: '#f5f4ee',
        padding: '0 4px',
        fontSize: 10,
        fontWeight: 'bold',
        color: '#000080',
        fontFamily: 'Tahoma, "Segoe UI", sans-serif',
    },
});

const LEVEL_BADGE_COLORS = ['#316ac5', '#2a7a2a', '#b46a00', '#7a2a7a', '#7a4a00'];

// Memoized Sub-component for the Preview
const BranchingPreview = memo(({ levels }: { levels: string[][] }) => (
    <div style={{
        border: '2px inset #aaa',
        background: 'white',
        padding: '6px',
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: 10,
        lineHeight: 1.8,
        minHeight: 120,
        overflowY: 'auto',
        flex: 1,
    }}>
        <div style={{ color: '#000080', fontWeight: 'bold' }}><i className="bi bi-box-seam" style={{ marginRight: 4 }} />{DUMMY_CODE}</div>
        {levels.map((lvl, lIdx) => (
            lvl.map((p, pIdx) => (
                <div key={`${lIdx}-${pIdx}`} style={{ paddingLeft: `${(lIdx + 1) * 14}px`, color: lIdx === 0 ? '#333' : '#555' }}>
                    {lIdx === 0 ? '├─ ' : '│ ├─ '}{p.replace('{CODE}', DUMMY_CODE) || '...'}
                </div>
            ))
        ))}
    </div>
));
BranchingPreview.displayName = 'BranchingPreview';

// Memoized Level Card — XP groupbox style
const LevelCard = memo(({
    lIdx,
    lvl,
    inherit,
    attributeSummary,
    onRemoveLevel,
    onAddPattern,
    onRemovePattern,
    onPatternChange,
    onInheritChange
}: {
    lIdx: number;
    lvl: string[];
    inherit: boolean;
    attributeSummary: string;
    onRemoveLevel: (idx: number) => void;
    onAddPattern: (idx: number) => void;
    onRemovePattern: (lIdx: number, pIdx: number) => void;
    onPatternChange: (lIdx: number, pIdx: number, val: string) => void;
    onInheritChange: (lIdx: number, value: boolean) => void;
}) => {
    const badgeColor = LEVEL_BADGE_COLORS[lIdx % LEVEL_BADGE_COLORS.length];
    const gb = xpGroupbox(`Level ${lIdx + 1}`);

    return (
        <div style={gb.wrapper}>
            <span style={gb.labelStyle}>Level {lIdx + 1}</span>

            {/* Card header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{
                    background: badgeColor, color: 'white',
                    fontSize: 9, fontWeight: 'bold', padding: '1px 6px',
                    borderRadius: 1, fontFamily: 'Tahoma, sans-serif',
                }}>L{lIdx + 1}</span>
                <span style={{ flex: 1, fontSize: 10, color: '#555', fontFamily: 'Tahoma, sans-serif' }}>
                    Processing Level
                </span>
                <button style={xpBtnDanger} onClick={() => onRemoveLevel(lIdx)}>
                    X Remove
                </button>
            </div>

            {/* Pattern rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {lvl.map((pattern, pIdx) => (
                    <div key={pIdx} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <span style={{
                            background: '#ddd', border: '1px solid #aaa',
                            padding: '1px 5px', fontSize: 10, minWidth: 18,
                            textAlign: 'center', fontFamily: 'Tahoma, sans-serif',
                        }}>{pIdx + 1}</span>
                        <input
                            type="text"
                            style={{ ...xpInput, flex: 1 }}
                            value={pattern}
                            onChange={(e) => onPatternChange(lIdx, pIdx, e.target.value)}
                            placeholder="e.g. WIP {CODE}"
                        />
                        {lvl.length > 1 && (
                            <button style={{ ...xpBtn, minWidth: 'auto', padding: '0 6px', fontSize: 12 }}
                                onClick={() => onRemovePattern(lIdx, pIdx)}>−</button>
                        )}
                    </div>
                ))}
            </div>

            <button
                style={{
                    background: 'none', border: 'none',
                    color: '#0000aa', fontSize: 10, cursor: 'pointer',
                    padding: '4px 0 0', fontFamily: 'Tahoma, sans-serif',
                    textDecoration: 'underline',
                }}
                onClick={() => onAddPattern(lIdx)}
            >
                + Add branching item
            </button>

            {/* Attribute inheritance is per level and opt-in — see DEFAULT_INHERIT. */}
            <label
                style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    marginTop: 6, paddingTop: 5, borderTop: '1px solid #e0ddd4',
                    fontSize: 10, color: attributeSummary ? '#333' : '#999',
                    cursor: attributeSummary ? 'pointer' : 'default',
                    fontFamily: 'Tahoma, sans-serif',
                }}
                title={attributeSummary
                    ? `Children on this level are created with the root's ${attributeSummary}`
                    : 'The root BOM has no attribute values assigned — nothing to inherit'}
            >
                <input
                    type="checkbox"
                    checked={inherit}
                    disabled={!attributeSummary}
                    onChange={e => onInheritChange(lIdx, e.target.checked)}
                    style={{ margin: 0 }}
                />
                Inherit attributes from root
                {attributeSummary && (
                    <span style={{ color: '#000080', fontWeight: 'bold' }}>({attributeSummary})</span>
                )}
            </label>
        </div>
    );
});
LevelCard.displayName = 'LevelCard';

const BOMAutomatorModal = memo(({ isOpen, onClose, onApply, rootAttributeSummary = '' }: BOMAutomatorModalProps) => {
    const { t } = useLanguage();
    const [levels, setLevels] = useState<string[][]>(DEFAULT_LEVELS);
    // Parallel to `levels` — index i is level i's "inherit root attributes" flag.
    // Kept in step with every levels mutation below.
    const [inheritAttributes, setInheritAttributes] = useState<boolean[]>(DEFAULT_INHERIT);
    const [profiles, setProfiles] = useState<AutoBOMProfile[]>([]);
    const [profileName, setProfileName] = useState('');
    const [saving, setSaving] = useState(false);
    const { authFetch } = useData();

    useEffect(() => {
        if (!isOpen) return;
        authFetch(`${API_BASE}/bom-automator-profiles`)
            .then(r => r.ok ? r.json() : [])
            .then(setProfiles)
            .catch(() => setProfiles([]));
        setLevels(DEFAULT_LEVELS);
        setInheritAttributes(DEFAULT_INHERIT);
    }, [isOpen, authFetch]);

    const handlePatternChange = useCallback((lIdx: number, pIdx: number, value: string) => {
        setLevels(prev => prev.map((lvl, i) =>
            i === lIdx ? lvl.map((p, j) => j === pIdx ? value : p) : lvl
        ));
    }, []);

    const handleInheritChange = useCallback((lIdx: number, value: boolean) => {
        setInheritAttributes(prev => prev.map((v, i) => i === lIdx ? value : v));
    }, []);

    const addLevel = useCallback(() => {
        setLevels(prev => [...prev, ['']]);
        setInheritAttributes(prev => [...prev, false]);
    }, []);

    const removeLevel = useCallback((index: number) => {
        setLevels(prev => prev.filter((_, i) => i !== index));
        setInheritAttributes(prev => prev.filter((_, i) => i !== index));
    }, []);

    const addPatternToLevel = useCallback((lIdx: number) => {
        setLevels(prev => prev.map((lvl, i) => i === lIdx ? [...lvl, ''] : lvl));
    }, []);

    const removePatternFromLevel = useCallback((lIdx: number, pIdx: number) => {
        setLevels(prev => prev.map((lvl, i) =>
            i === lIdx ? lvl.filter((_, j) => j !== pIdx) : lvl
        ));
    }, []);

    const handleSaveProfile = useCallback(async () => {
        if (!profileName.trim() || saving) return;
        setSaving(true);
        try {
            const res = await authFetch(`${API_BASE}/bom-automator-profiles`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: profileName.trim(), levels, inherit_attributes: inheritAttributes }),
            });
            if (res.ok) {
                const newProfile = await res.json();
                setProfiles(prev => [...prev, newProfile]);
                setProfileName('');
            }
        } finally {
            setSaving(false);
        }
    }, [profileName, levels, inheritAttributes, saving, authFetch]);

    const handleLoadProfile = useCallback((profile: AutoBOMProfile) => {
        setLevels(profile.levels);
        setInheritAttributes(normalizeInherit(profile.inherit_attributes, profile.levels.length));
    }, []);

    const handleDeleteProfile = useCallback(async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        await authFetch(`${API_BASE}/bom-automator-profiles/${id}`, { method: 'DELETE' });
        setProfiles(prev => prev.filter(p => p.id !== id));
    }, [authFetch]);

    const handleSaveAndApply = useCallback(() => {
        // A root with no attribute values has nothing to inherit — send all-false so a
        // stale tick from a loaded profile can't stamp anything onto the children.
        onApply(levels, rootAttributeSummary
            ? normalizeInherit(inheritAttributes, levels.length)
            : levels.map(() => false));
        onClose();
    }, [levels, inheritAttributes, rootAttributeSummary, onApply, onClose]);

    if (!isOpen) return null;

    const gb = xpGroupbox('Saved Profiles');
    const gbPreview = xpGroupbox('Structure Preview');
    const gbTip = xpGroupbox('Tip');

    return (
        <ModalWrapper
            isOpen={isOpen}
            onClose={onClose}
            title="BOM Automator — Configure Structure"
            size="lg"
            variant="primary"
            modeless
            footer={<>
                <button style={xpBtn} onClick={onClose}>{t('cancel')}</button>
                <button
                    data-testid="generate-structure-btn"
                    style={xpBtnPrimary}
                    onClick={handleSaveAndApply}
                >
                    Generate Structure
                </button>
            </>}
        >
            <div
                data-testid="bom-automator-modal"
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: '70vh',
                    fontFamily: 'Tahoma, "Segoe UI", sans-serif',
                    fontSize: 11,
                }}
            >
                {/* Body: two columns */}
                <div style={{
                    display: 'flex',
                    gap: 8,
                    overflow: 'hidden',
                    flex: 1,
                    minHeight: 0,
                }}>
                    {/* Left: config + levels (scrollable) */}
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0, paddingRight: 4, paddingTop: 10 }}>

                        {/* Saved Profiles */}
                        <div style={gb.wrapper}>
                            <span style={gb.labelStyle}>Saved Profiles</span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 6, minHeight: 20 }}>
                                {profiles.length === 0 && (
                                    <span style={{ fontSize: 10, color: '#888', fontStyle: 'italic' }}>No saved configurations.</span>
                                )}
                                {profiles.map(p => (
                                    <div key={p.id} style={{ display: 'flex', border: '1px solid #aaa' }}>
                                        <button
                                            style={{ ...xpBtn, minWidth: 'auto', borderRight: 'none', fontSize: 10, padding: '1px 8px' }}
                                            onClick={() => handleLoadProfile(p)}
                                        >
                                            {p.name}
                                        </button>
                                        <button
                                            style={{ ...xpBtnDanger, borderLeft: 'none', borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
                                            onClick={(e) => handleDeleteProfile(e, p.id)}
                                        >X</button>
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: 4 }}>
                                <input
                                    type="text"
                                    style={{ ...xpInput, flex: 1 }}
                                    placeholder="New profile name..."
                                    value={profileName}
                                    onChange={e => setProfileName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleSaveProfile()}
                                />
                                <button
                                    style={profileName.trim() && !saving ? xpBtnPrimary : { ...xpBtn, opacity: 0.5 }}
                                    onClick={handleSaveProfile}
                                    disabled={!profileName.trim() || saving}
                                >
                                    {saving ? 'Saving...' : 'Save'}
                                </button>
                            </div>
                        </div>

                        {/* Level Cards */}
                        <div style={{ fontSize: 10, fontWeight: 'bold', color: '#000080', marginBottom: 2 }}>
                            Processing Levels
                        </div>
                        <div style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>
                            Use <code style={{ background: '#f0e8a0', padding: '0 3px', border: '1px solid #d0c860' }}>{'{CODE}'}</code> as a placeholder — replaced with the parent item code on generation.
                        </div>

                        {levels.map((lvl, lIdx) => (
                            <LevelCard
                                key={lIdx}
                                lIdx={lIdx}
                                lvl={lvl}
                                inherit={!!inheritAttributes[lIdx]}
                                attributeSummary={rootAttributeSummary}
                                onRemoveLevel={removeLevel}
                                onAddPattern={addPatternToLevel}
                                onRemovePattern={removePatternFromLevel}
                                onPatternChange={handlePatternChange}
                                onInheritChange={handleInheritChange}
                            />
                        ))}

                        <button
                            style={{
                                ...xpBtn, width: '100%',
                                borderStyle: 'dashed',
                                borderColor: '#888',
                                fontSize: 10, textAlign: 'center',
                            }}
                            onClick={addLevel}
                        >
                            + Add Next Level
                        </button>
                    </div>

                    {/* Right: preview panel */}
                    <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>

                        <div style={{ ...gbPreview.wrapper, flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <span style={gbPreview.labelStyle}>Structure Preview</span>
                            <div style={{ fontSize: 10, color: '#555', marginBottom: 6 }}>
                                Preview with code: <strong>{DUMMY_CODE}</strong>
                            </div>
                            <BranchingPreview levels={levels} />
                        </div>

                        <div style={{ ...gbTip.wrapper, background: '#fffbe6', borderColor: '#d4b000' }}>
                            <span style={{ ...gbTip.labelStyle, background: '#fffbe6', color: '#806000' }}>Tip</span>
                            <div style={{ fontSize: 10, color: '#555', lineHeight: 1.6 }}>
                                Each level becomes a child BOM node. Branching items at the same level are created as siblings under the parent.
                                <div style={{ marginTop: 6 }}>
                                    Children are generated with <strong>no attribute values</strong> unless you tick
                                    &quot;Inherit attributes from root&quot; on that level.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </ModalWrapper>
    );
});

BOMAutomatorModal.displayName = 'BOMAutomatorModal';

export default BOMAutomatorModal;
