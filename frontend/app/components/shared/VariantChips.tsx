'use client';

/**
 * Variant chips — combo / size / colour-variant / colour-spec for one MO or WO.
 *
 * Extracted from the WO list so every screen that answers "which variant is this?"
 * (WO table, weaving loom card, machine monitor) renders the same badges in the same
 * order with the same colours. Add a variant dimension here, not per page.
 *
 * `scale` picks the density: 'xs' for dense table rows, 'sm' for cards/headers.
 */
export interface VariantChipsProps {
    combo?: string | null;
    size?: string | null;
    /** `Colors` variant attribute value (e.g. "Black") — not the Color Library shade. */
    colorVariant?: string | null;
    /** Color Library shade this row produces. */
    colorCode?: string | null;
    colorName?: string | null;
    colorHex?: string | null;
    /** Pending lab dip code — shown only while the shade has no approved colour yet. */
    labdipCode?: string | null;
    scale?: 'xs' | 'sm';
    style?: React.CSSProperties;
}

export default function VariantChips({
    combo, size, colorVariant, colorCode, colorName, colorHex, labdipCode,
    scale = 'xs', style,
}: VariantChipsProps) {
    const sm = scale === 'sm';
    const fs = sm ? 10 : 8;
    const base: React.CSSProperties = {
        fontSize: fs,
        padding: sm ? '0 5px' : '0 4px',
        borderRadius: 2,
        fontWeight: 700,
        lineHeight: sm ? '16px' : '14px',
        whiteSpace: 'nowrap',
        flexShrink: 0,
    };
    const iconFs = sm ? 9 : 7;
    const swatch = sm ? 8 : 7;

    if (!combo && !size && !colorVariant && !colorCode && !labdipCode) return null;

    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, ...style }}>
            {combo && (
                <span style={{ ...base, background: '#dbeafe', color: '#1d4ed8' }} title={`Combo: ${combo}`}>
                    {combo}
                </span>
            )}
            {size && (
                <span style={{ ...base, background: '#dcfce7', color: '#15803d' }} title={`Size: ${size}`}>
                    <i className="bi bi-rulers me-1" style={{ fontSize: iconFs }}></i>{size}
                </span>
            )}
            {colorVariant && (
                <span style={{ ...base, background: '#fce7f3', color: '#9d174d' }} title={`Variant: ${colorVariant}`}>
                    {colorVariant}
                </span>
            )}
            {colorCode ? (
                <span
                    style={{ ...base, display: 'inline-flex', alignItems: 'center', gap: 3, background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1' }}
                    title={`Color: ${colorCode}${colorName && colorName !== colorCode ? ` — ${colorName}` : ''}`}
                >
                    {colorHex
                        ? <span style={{ width: swatch, height: swatch, background: colorHex, border: '1px solid rgba(0,0,0,0.35)', flexShrink: 0, display: 'inline-block' }} />
                        : <i className="bi bi-palette" style={{ fontSize: iconFs }}></i>}
                    {colorCode}
                </span>
            ) : labdipCode ? (
                <span
                    style={{ ...base, background: '#fbf4dd', color: '#8a6d00', border: '1px solid #e8dca8' }}
                    title={`Color still in lab dip (${labdipCode}) — dyeing is blocked until approved`}
                >
                    <i className="bi bi-eyedropper me-1" style={{ fontSize: iconFs }}></i>{labdipCode}
                </span>
            ) : null}
        </span>
    );
}
