'use client';
import React, { useMemo, useState } from 'react';
import { PixelAvatarFromRecipe } from './PixelAvatar';
import { xpBtn, BUTTON_RADIUS } from './xpTheme';
import {
    AvatarRecipe,
    COLOR_SLOTS,
    ColorKey,
    FEATURE_SLOTS,
    FeatureSlot,
    resolveRecipe,
    serializeRecipe,
    setColor,
    setFeature,
    shuffleRecipe,
} from './avatarRecipe';

const THUMB = 30;
const SWATCH = 20;

// Every slot offers "Auto" (leave it to the seed) alongside the explicit
// choices, so picking a hat doesn't silently freeze hair, eyes and mouth at
// whatever the seed happened to roll.
const AUTO = 'auto';
const NONE = 'none';

type TabKey = FeatureSlot['key'] | 'colors';

function selectedChrome(isSelected: boolean, classic?: boolean): React.CSSProperties {
    if (classic) {
        return {
            background: isSelected ? '#c8d8f0' : '#e0dcd4',
            border: '2px solid',
            borderColor: isSelected ? '#0a246a #00184a #00184a #0a246a' : '#fff #aaa #aaa #fff',
            boxShadow: isSelected ? 'inset 1px 1px 0 #3a6ea8' : undefined,
        };
    }
    return {
        background: isSelected ? '#e8f0fe' : '#f8f9fa',
        border: isSelected ? '2px solid #0d6efd' : '2px solid #dee2e6',
        borderRadius: 6,
    };
}

function OptionButton({ title, isSelected, classic, onClick, children }: {
    title: string;
    isSelected: boolean;
    classic?: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            title={title}
            onClick={onClick}
            style={{
                width: THUMB + 10, height: THUMB + 10, padding: 3, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                ...selectedChrome(isSelected, classic),
            }}
        >
            {children}
        </button>
    );
}

function TextChip({ label, isSelected, classic, onClick }: {
    label: string;
    isSelected: boolean;
    classic?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            style={{
                fontSize: 10, lineHeight: 1, padding: '0 6px', height: THUMB + 10, minWidth: 40,
                cursor: 'pointer', flexShrink: 0, color: classic ? '#000' : '#212529',
                ...selectedChrome(isSelected, classic),
            }}
        >
            {label}
        </button>
    );
}

interface AvatarPickerProps {
    value: string | null | undefined;
    onChange: (recipe: string) => void;
    /** Identity to seed from when `value` holds no recipe yet — usually username. */
    seed?: string | null;
    classic?: boolean;
}

export default function AvatarPicker({ value, onChange, seed, classic }: AvatarPickerProps) {
    const [tab, setTab] = useState<TabKey>('hat');
    const recipe = useMemo(() => resolveRecipe(value, seed), [value, seed]);

    const emit = (next: AvatarRecipe) => onChange(serializeRecipe(next));

    const tabs: { key: TabKey; label: string }[] = [
        ...FEATURE_SLOTS.map(s => ({ key: s.key as TabKey, label: s.label })),
        { key: 'colors', label: 'Colors' },
    ];

    const activeSlot = FEATURE_SLOTS.find(s => s.key === tab);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: classic ? 2 : 4, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                    {tabs.map(({ key, label }) => {
                        const isSelected = tab === key;
                        return (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setTab(key)}
                                style={{
                                    fontSize: 10, lineHeight: 1, padding: '4px 7px', cursor: 'pointer',
                                    color: classic ? '#000' : '#212529',
                                    ...selectedChrome(isSelected, classic),
                                    borderWidth: classic ? 2 : 1,
                                }}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
                <button
                    type="button"
                    onClick={() => emit(shuffleRecipe())}
                    title="Roll a brand new avatar"
                    style={classic
                        ? xpBtn({ flexShrink: 0 })
                        : {
                            fontSize: 10, padding: '4px 9px', cursor: 'pointer', flexShrink: 0,
                            background: '#f8f9fa', border: '1px solid #dee2e6',
                            borderRadius: BUTTON_RADIUS, color: '#212529',
                        }}
                >
                    Shuffle
                </button>
            </div>

            {activeSlot ? (
                <div style={{ display: 'flex', gap: classic ? 3 : 5, overflowX: 'auto', paddingBottom: 4 }}>
                    <TextChip
                        label="Auto"
                        isSelected={recipe.features[activeSlot.key] === undefined}
                        classic={classic}
                        onClick={() => emit(setFeature(recipe, activeSlot.key, undefined))}
                    />
                    {activeSlot.optional && (
                        <TextChip
                            label="None"
                            isSelected={recipe.features[activeSlot.key] === null}
                            classic={classic}
                            onClick={() => emit(setFeature(recipe, activeSlot.key, null))}
                        />
                    )}
                    {activeSlot.variants.map(variant => {
                        // Each thumbnail previews this avatar with only the one
                        // slot swapped, so what you see is what you get.
                        const candidate = setFeature(recipe, activeSlot.key, variant);
                        return (
                            <OptionButton
                                key={variant}
                                title={`${activeSlot.label} — ${variant}`}
                                isSelected={recipe.features[activeSlot.key] === variant}
                                classic={classic}
                                onClick={() => emit(candidate)}
                            >
                                <PixelAvatarFromRecipe recipe={candidate} size={THUMB} />
                            </OptionButton>
                        );
                    })}
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {COLOR_SLOTS.map(slot => (
                        <div key={slot.key} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                            <span style={{ fontSize: 10, width: 84, flexShrink: 0, color: classic ? '#000' : '#6c757d' }}>
                                {slot.label}
                            </span>
                            <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2 }}>
                                <TextChip
                                    label="Auto"
                                    isSelected={recipe.colors[slot.key] === undefined}
                                    classic={classic}
                                    onClick={() => emit(setColor(recipe, slot.key, undefined))}
                                />
                                {slot.palette.map(hex => {
                                    const isSelected = recipe.colors[slot.key] === hex;
                                    return (
                                        <button
                                            key={hex}
                                            type="button"
                                            title={`#${hex}`}
                                            onClick={() => emit(setColor(recipe, slot.key as ColorKey, hex))}
                                            style={{
                                                width: SWATCH + 8, height: THUMB + 10, padding: 3, cursor: 'pointer',
                                                flexShrink: 0, ...selectedChrome(isSelected, classic),
                                            }}
                                        >
                                            <span style={{
                                                display: 'block', width: '100%', height: '100%',
                                                background: `#${hex}`,
                                                border: '1px solid rgba(0,0,0,0.25)',
                                            }} />
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
