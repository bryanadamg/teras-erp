'use client';

import React from 'react';
import { CODE_FONT } from './xpTheme';

/**
 * Shared lot-identity chips for lot/beam pickers (WO staging, WO completion,
 * bag scanning). A produced lot's number alone doesn't tell an operator what it
 * is — two GRG- lots off the same item differ only by size and combo/shade. The
 * backend resolves those onto every batch (`bom_size_snapshot` on the lot itself,
 * `variant_attributes` + Color Library fields from the producing MO), so every
 * picker labels a lot the same way instead of hand-rolling its own text line.
 */

export interface LotVariantAttr {
    name: string;
    value: string;
    hex?: string | null;
    system_role?: string | null;
}

export interface LotLike {
    bom_size_snapshot?: { size_name?: string | null; label?: string | null } | null;
    variant_attributes?: LotVariantAttr[] | null;
    color_code?: string | null;
    color_name?: string | null;
    color_hex?: string | null;
    labdip_variant_code?: string | null;
    vendor_lot?: string | null;
    location_name?: string | null;
    wo_code?: string | null;
    mo_code?: string | null;
    [k: string]: any;
}

export const lotSizeLabel = (b: LotLike): string | null => {
    const s = b?.bom_size_snapshot;
    if (!s) return null;
    return ((s.size_name || s.label || '') as string).trim() || null;
};

export const lotComboLabel = (b: LotLike): string | null => {
    const hit = (b?.variant_attributes || []).find(a => a.system_role === 'combo');
    return hit?.value || null;
};

/**
 * Shade identity as one chip: shade code + shade name. The code can come from the
 * Color Library (`color_code`) or from the mirrored `Color Code` attribute value,
 * the name from the Color Library or the `Colors` variant attribute — the floor
 * reads them together, so they never split into two chips. A lot ordered against
 * an unapproved lab dip has only `labdip_variant_code`; that shows as pending.
 */
export const lotColorLabel = (b: LotLike): { label: string; hex?: string | null; pending: boolean } | null => {
    const attrs = b?.variant_attributes || [];
    const attrCode = attrs.find(a => a.system_role === 'labdip_color');
    const attrName = attrs.find(a => a.system_role === 'color');
    const code = b?.color_code || attrCode?.value || null;
    const name = b?.color_name || attrName?.value || null;
    if (code || name) {
        return {
            label: [code, name].filter(Boolean).join(' '),
            hex: b?.color_hex || attrName?.hex || null,
            pending: false,
        };
    }
    if (b?.labdip_variant_code) return { label: b.labdip_variant_code, pending: true };
    return null;
};

const TONE = {
    size: { fg: '#3d4d5c', bg: '#e8edf0', border: '#b8c4cc' },
    combo: { fg: '#5a4499', bg: '#efeaff', border: '#cabbec' },
    color: { fg: '#8a3a5a', bg: '#fdeaf1', border: '#e8bcd0' },
    pending: { fg: '#7a4500', bg: '#fdf3d8', border: '#e0c080' },
    material: { fg: '#3a6b2a', bg: '#e8f0e2', border: '#b8d0a8' },
    location: { fg: '#0058e6', bg: '#e8f0ff', border: '#a8c8f0' },
    order: { fg: '#444', bg: '#eceae2', border: '#c4c2ba' },
    qty: { fg: '#1a5e1a', bg: '#e4f3e4', border: '#a8d0a8' },
} as const;

export type LotChipTone = keyof typeof TONE;

export function LotChip({
    children, tone = 'order', title, mono, rounded, swatch,
}: {
    children: React.ReactNode;
    tone?: LotChipTone;
    title?: string;
    mono?: boolean;
    rounded?: boolean;
    swatch?: string | null;
}) {
    const t = TONE[tone];
    return (
        <span
            title={title}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 9, fontWeight: 'bold', padding: '0 4px',
                borderRadius: rounded ? 8 : 0, lineHeight: '14px',
                color: t.fg, background: t.bg, border: `1px solid ${t.border}`,
                // `mono` marks the two chips that hold a CODE (supplier lot, producing
                // order) rather than an attribute value. They stay chips — inside a
                // LotChipRow they are peers of the size/combo/shade chips and bare text
                // would break the row — but they share the app-wide code face.
                whiteSpace: 'nowrap', fontFamily: mono ? CODE_FONT : undefined,
            }}
        >
            {swatch ? (
                <span style={{
                    width: 7, height: 7, flexShrink: 0, borderRadius: '50%',
                    background: swatch, border: '1px solid rgba(0,0,0,.35)',
                }} />
            ) : null}
            {children}
        </span>
    );
}

export function LotChipRow({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center', ...style }}>
            {children}
        </div>
    );
}

/**
 * Identity chips for one lot: size, combo, shade, then (optionally) the other
 * variant attributes, location and producing order. Renders nothing when the lot
 * carries no identity at all, so callers can drop it in unconditionally.
 */
export function LotChips({
    batch, rounded, showLocation, showOrder, showQty, qtyUnit = 'kg', showOtherAttrs = true,
}: {
    batch: LotLike;
    rounded?: boolean;
    showLocation?: boolean;
    showOrder?: boolean;
    showQty?: number | null;
    qtyUnit?: string;
    showOtherAttrs?: boolean;
}) {
    const size = lotSizeLabel(batch);
    const combo = lotComboLabel(batch);
    const color = lotColorLabel(batch);
    // color + labdip_color are already folded into the single shade chip above.
    const others = showOtherAttrs
        ? (batch.variant_attributes || []).filter(a => !['combo', 'color', 'labdip_color'].includes(a.system_role || ''))
        : [];

    const chips: React.ReactNode[] = [];
    if (showQty != null) {
        chips.push(
            <LotChip key="qty" tone="qty" rounded={rounded} title="Quantity remaining">
                {showQty.toFixed(2)} {qtyUnit}
            </LotChip>,
        );
    }
    if (size) {
        chips.push(
            <LotChip key="size" tone="size" rounded={rounded} title={`Size: ${size}`}>
                <i className="bi bi-rulers" />{size}
            </LotChip>,
        );
    }
    if (combo) {
        chips.push(
            <LotChip key="combo" tone="combo" rounded={rounded} title={`Combo: ${combo}`}>
                <i className="bi bi-grid-3x3-gap" />{combo}
            </LotChip>,
        );
    }
    if (color) {
        chips.push(
            <LotChip
                key="color"
                tone={color.pending ? 'pending' : 'color'}
                rounded={rounded}
                swatch={color.hex || null}
                title={color.pending ? `Shade pending lab dip approval: ${color.label}` : `Color: ${color.label}`}
            >
                {color.label}{color.pending ? ' (pending)' : ''}
            </LotChip>,
        );
    }
    others.forEach((a, i) => chips.push(
        <LotChip key={`a${i}`} tone="material" rounded={rounded} swatch={a.hex || null} title={`${a.name}: ${a.value}`}>
            {a.value}
        </LotChip>,
    ));
    if (batch.vendor_lot) {
        chips.push(
            <LotChip key="vendor" tone="pending" rounded={rounded} mono title="Supplier lot">
                {batch.vendor_lot}
            </LotChip>,
        );
    }
    if (showLocation && batch.location_name) {
        chips.push(
            <LotChip key="loc" tone="location" rounded={rounded} title="Current location">
                <i className="bi bi-geo-alt" />{batch.location_name}
            </LotChip>,
        );
    }
    if (showOrder && (batch.wo_code || batch.mo_code)) {
        chips.push(
            <LotChip key="ord" tone="order" rounded={rounded} mono title="Produced by">
                {batch.wo_code || batch.mo_code}
            </LotChip>,
        );
    }

    if (!chips.length) return null;
    return <LotChipRow>{chips}</LotChipRow>;
}
