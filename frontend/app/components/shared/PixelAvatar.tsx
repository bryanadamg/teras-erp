'use client';
import React, { CSSProperties, useMemo } from 'react';
import { createAvatar } from '@dicebear/core';
import { pixelArt } from '@dicebear/collection';
import {
    AvatarRecipe,
    buildDicebearOptions,
    resolveRecipe,
    serializeRecipe,
} from './avatarRecipe';

// Avatars render on every page (sidebar, mobile shell, user lists), and the
// picker renders one thumbnail per variant — 45 of them for hair. Generation is
// pure and deterministic, so memoizing by recipe+size turns all of that into
// one createAvatar call per distinct avatar per session.
const CACHE_LIMIT = 600;
const cache = new Map<string, string>();

function renderSvg(recipe: AvatarRecipe, size: number): string {
    const key = `${serializeRecipe(recipe)}#${size}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    const svg = createAvatar(pixelArt, { ...buildDicebearOptions(recipe), size }).toString();
    // Coarse eviction: the working set is small and bounded by the number of
    // users on screen, so a full clear is cheaper than tracking LRU order.
    if (cache.size >= CACHE_LIMIT) cache.clear();
    cache.set(key, svg);
    return svg;
}

/** Renders a recipe that the caller already holds (used by the picker). */
export function PixelAvatarFromRecipe({ recipe, size = 32, style }: {
    recipe: AvatarRecipe;
    size?: number;
    style?: CSSProperties;
}) {
    const key = serializeRecipe(recipe);
    // DiceBear's output is a fixed tag set (svg/g/mask/rect/path/metadata) built
    // from schema-constrained values, and it entity-escapes the colors it is
    // given, so injecting the markup is safe. avatarRecipe additionally drops
    // any variant that isn't in the style's own enum.
    const svg = useMemo(() => renderSvg(recipe, size), [key, size]);

    return (
        <span
            aria-hidden="true"
            style={{ display: 'block', width: size, height: size, flexShrink: 0, ...style }}
            dangerouslySetInnerHTML={{ __html: svg }}
        />
    );
}

interface PixelAvatarProps {
    /** Stored `users.avatar_id` recipe. Legacy sprite ids fall back to `seed`. */
    avatarId?: string | null;
    /** Identity to seed from when there is no stored recipe — usually username. */
    seed?: string | null;
    /**
     * The user's role's `default_avatar_id` — a template whose pinned slots apply
     * only while `avatarId` holds no recipe. Pass it wherever a user's avatar is
     * drawn; leaving it off silently downgrades that one spot to the unconstrained
     * seeded face, which is exactly the inconsistency it exists to prevent.
     */
    template?: string | null;
    size?: number;
    style?: CSSProperties;
}

export default function PixelAvatar({ avatarId, seed, template, size = 32, style }: PixelAvatarProps) {
    const recipe = useMemo(() => resolveRecipe(avatarId, seed, template), [avatarId, seed, template]);
    return <PixelAvatarFromRecipe recipe={recipe} size={size} style={style} />;
}
