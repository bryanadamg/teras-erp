/**
 * Avatar identity, stored in `users.avatar_id` as a versioned recipe string:
 *
 *   v1|bryan|ht:variant03|gl:|sk:8d5524
 *
 * The seed drives every feature DiceBear picks; the `code:value` pairs pin
 * individual slots on top of it. Three states per slot matter here:
 *
 *   absent key  -> leave it to the seed
 *   `gl:`       -> explicitly off
 *   `gl:dark02` -> pinned to this variant
 *
 * That distinction is what lets someone turn a hat off without freezing the
 * rest of their avatar, and it maps onto DiceBear's `<slot>Probability`
 * companion options (0 = never, 100 = always).
 *
 * The same string is also used as a ROLE TEMPLATE (`Role.default_avatar_id`),
 * where only the `code:value` pairs matter and the seed is ignored — see
 * `resolveRecipe`. That reuse is the whole reason the three-state slot encoding
 * above exists: a template can say "no hat, no accessories" and leave hair, eyes
 * and mouth to each user's own seed, so a role sets a dress code without giving
 * everyone in it the same face.
 *
 * Anything not starting with `v1|` is a pre-DiceBear value — the old '1'..'10'
 * hand-drawn sprite ids — and resolves to a username-seeded avatar instead.
 * The old sprites are gone, so there is nothing faithful to migrate them to.
 */
import { pixelArt } from '@dicebear/collection';

const RECIPE_VERSION = 'v1';
const SEP = '|';
const PAIR = ':';
const MAX_SEED_LENGTH = 32;

/** Used when we have neither a stored recipe nor a username to seed from. */
export const AVATAR_SEED_FALLBACK = 'teras';

// ---------------------------------------------------------------------------
// Slot definitions, read off the installed style's own JSON schema
// ---------------------------------------------------------------------------

// Reading the variant lists at runtime rather than hardcoding them means a
// DiceBear upgrade that adds variants picks them up for free, and it gives us
// the allowlist we validate stored recipes against. DiceBear does not validate
// option values itself — an unknown variant silently renders nothing — so
// dropping unknowns here is what keeps a stale recipe from losing a body part.
type SchemaProp = { default?: unknown; items?: { enum?: string[]; default?: unknown } };
const PROPS: Record<string, SchemaProp> =
    (pixelArt as unknown as { schema?: { properties?: Record<string, SchemaProp> } })
        .schema?.properties ?? {};

const variantsOf = (key: string): string[] => PROPS[key]?.items?.enum ?? [];

const paletteOf = (key: string): string[] => {
    const prop = PROPS[key];
    const value = prop?.default ?? prop?.items?.default;
    return Array.isArray(value) ? (value as string[]) : [];
};

export type FeatureKey =
    'hat' | 'hair' | 'glasses' | 'clothing' | 'eyes' | 'mouth' | 'beard' | 'accessories';

export interface FeatureSlot {
    key: FeatureKey;
    /** Short token used in the stored recipe string. */
    code: string;
    label: string;
    /** Has a `<key>Probability` companion, so it can be switched off entirely. */
    optional: boolean;
    variants: string[];
}

export const FEATURE_SLOTS: FeatureSlot[] = [
    { key: 'hat', code: 'ht', label: 'Hat', optional: true, variants: variantsOf('hat') },
    { key: 'hair', code: 'hr', label: 'Hair', optional: false, variants: variantsOf('hair') },
    { key: 'glasses', code: 'gl', label: 'Glasses', optional: true, variants: variantsOf('glasses') },
    { key: 'clothing', code: 'cl', label: 'Clothing', optional: false, variants: variantsOf('clothing') },
    { key: 'eyes', code: 'ey', label: 'Eyes', optional: false, variants: variantsOf('eyes') },
    { key: 'mouth', code: 'mo', label: 'Mouth', optional: false, variants: variantsOf('mouth') },
    { key: 'beard', code: 'bd', label: 'Beard', optional: true, variants: variantsOf('beard') },
    { key: 'accessories', code: 'ac', label: 'Accessories', optional: true, variants: variantsOf('accessories') },
];

export type ColorKey = 'skinColor' | 'hairColor' | 'clothingColor' | 'hatColor' | 'mouthColor';

export interface ColorSlot {
    key: ColorKey;
    code: string;
    label: string;
    palette: string[];
}

export const COLOR_SLOTS: ColorSlot[] = [
    { key: 'skinColor', code: 'sk', label: 'Skin', palette: paletteOf('skinColor') },
    { key: 'hairColor', code: 'hc', label: 'Hair Color', palette: paletteOf('hairColor') },
    { key: 'clothingColor', code: 'cc', label: 'Clothing Color', palette: paletteOf('clothingColor') },
    { key: 'hatColor', code: 'hk', label: 'Hat Color', palette: paletteOf('hatColor') },
    { key: 'mouthColor', code: 'mc', label: 'Mouth Color', palette: paletteOf('mouthColor') },
];

const FEATURE_BY_CODE = new Map(FEATURE_SLOTS.map(s => [s.code, s]));
const COLOR_BY_CODE = new Map(COLOR_SLOTS.map(s => [s.code, s]));
const HEX = /^[0-9a-f]{6}$/i;

// ---------------------------------------------------------------------------
// Recipe
// ---------------------------------------------------------------------------

export interface AvatarRecipe {
    seed: string;
    /** Pinned variant, or `null` for "explicitly off" (optional slots only). */
    features: Partial<Record<FeatureKey, string | null>>;
    colors: Partial<Record<ColorKey, string>>;
}

/** Strips the separators our encoding depends on, and caps stored length. */
const sanitizeSeed = (seed: string): string =>
    seed.replace(/[|:]/g, '_').trim().slice(0, MAX_SEED_LENGTH);

export function serializeRecipe(recipe: AvatarRecipe): string {
    const parts = [RECIPE_VERSION, sanitizeSeed(recipe.seed)];
    for (const slot of FEATURE_SLOTS) {
        const value = recipe.features[slot.key];
        if (value === undefined) continue;
        parts.push(`${slot.code}${PAIR}${value === null ? '' : value}`);
    }
    for (const slot of COLOR_SLOTS) {
        const value = recipe.colors[slot.key];
        if (value) parts.push(`${slot.code}${PAIR}${value}`);
    }
    return parts.join(SEP);
}

/**
 * Parses a stored recipe, or returns null if this isn't one (legacy sprite id,
 * empty, or malformed). Unknown slots and out-of-range values are dropped
 * rather than rejected, so a recipe written by a newer build degrades to a
 * valid avatar instead of a broken one.
 */
export function parseRecipe(stored: string | null | undefined): AvatarRecipe | null {
    if (!stored) return null;
    const parts = stored.split(SEP);
    if (parts.length < 2 || parts[0] !== RECIPE_VERSION) return null;

    const seed = sanitizeSeed(parts[1]);
    if (!seed) return null;

    const recipe: AvatarRecipe = { seed, features: {}, colors: {} };
    for (const part of parts.slice(2)) {
        const at = part.indexOf(PAIR);
        if (at < 0) continue;
        const code = part.slice(0, at);
        const value = part.slice(at + 1);

        const feature = FEATURE_BY_CODE.get(code);
        if (feature) {
            if (!value) {
                if (feature.optional) recipe.features[feature.key] = null;
            } else if (feature.variants.includes(value)) {
                recipe.features[feature.key] = value;
            }
            continue;
        }

        const color = COLOR_BY_CODE.get(code);
        if (color && HEX.test(value)) recipe.colors[color.key] = value.toLowerCase();
    }
    return recipe;
}

/**
 * Resolve what to render, in three tiers:
 *
 *   1. the user's own saved recipe          — their choice always wins
 *   2. `template`'s pins over `seed`        — the role default (dress code)
 *   3. a bare recipe seeded from `seed`     — every slot from the seed, as before
 *
 * Tier 2 is a merge, not a substitution: the template contributes its pinned
 * slots and NOTHING else, and the seed still comes from the user. That is what
 * keeps a role's directors looking like different people while none of them can
 * roll a party hat. A template with no pins is indistinguishable from no
 * template, which is what makes "clear the default" a no-op rather than a
 * special case.
 *
 * Tier 3 exists so a user who has never opened the picker still gets a stable
 * avatar of their own rather than everyone sharing one default.
 */
export function resolveRecipe(
    stored: string | null | undefined,
    seed?: string | null,
    template?: string | null,
): AvatarRecipe {
    const own = parseRecipe(stored);
    if (own) return own;

    const base: AvatarRecipe = {
        seed: sanitizeSeed(seed || '') || AVATAR_SEED_FALLBACK,
        features: {},
        colors: {},
    };
    const pins = parseRecipe(template);
    if (!pins) return base;
    // Template seed deliberately dropped — only its pins carry over.
    return { ...base, features: { ...pins.features }, colors: { ...pins.colors } };
}

/**
 * Does this recipe actually constrain anything? Used by the role form to store
 * `null` instead of a pin-less recipe: a template that pins nothing is not a
 * default, and storing one would put a row in the DB that reads as configured.
 */
export function hasPins(recipe: AvatarRecipe): boolean {
    return Object.keys(recipe.features).length > 0 || Object.keys(recipe.colors).length > 0;
}

/** A fresh random seed, keeping every slot seed-driven. Used by "Shuffle". */
export function shuffleRecipe(): AvatarRecipe {
    return {
        seed: Math.random().toString(36).slice(2, 10),
        features: {},
        colors: {},
    };
}

export function setFeature(
    recipe: AvatarRecipe,
    key: FeatureKey,
    value: string | null | undefined,
): AvatarRecipe {
    const features = { ...recipe.features };
    if (value === undefined) delete features[key];
    else features[key] = value;
    return { ...recipe, features };
}

export function setColor(
    recipe: AvatarRecipe,
    key: ColorKey,
    value: string | undefined,
): AvatarRecipe {
    const colors = { ...recipe.colors };
    if (value === undefined) delete colors[key];
    else colors[key] = value;
    return { ...recipe, colors };
}

// ---------------------------------------------------------------------------
// DiceBear options
// ---------------------------------------------------------------------------

/**
 * Translates a recipe into DiceBear options. A pinned slot becomes a
 * single-element array (DiceBear picks randomly from whatever array it is
 * given, so a one-element array is how you pin), plus a probability of 100 so
 * an optional slot actually shows up regardless of seed.
 */
export function buildDicebearOptions(recipe: AvatarRecipe): Record<string, unknown> {
    const options: Record<string, unknown> = { seed: recipe.seed };

    for (const slot of FEATURE_SLOTS) {
        const value = recipe.features[slot.key];
        if (value === undefined) continue;
        if (value === null) {
            if (slot.optional) options[`${slot.key}Probability`] = 0;
            continue;
        }
        options[slot.key] = [value];
        if (slot.optional) options[`${slot.key}Probability`] = 100;
    }

    for (const slot of COLOR_SLOTS) {
        const value = recipe.colors[slot.key];
        if (value) options[slot.key] = [value];
    }
    return options;
}
