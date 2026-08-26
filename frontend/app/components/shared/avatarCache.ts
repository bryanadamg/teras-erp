/**
 * Remembers signed-in users' avatar recipes in this browser, so the login
 * screen can show someone their own face before they authenticate.
 *
 * A customised avatar lives in `users.avatar_id` behind auth, and serving it to
 * an unauthenticated caller would leak both that an account exists and what
 * that person picked. Caching it locally after a successful login sidesteps
 * that: nothing new leaves the server, and the data never leaves the device.
 *
 * Keyed by username and capped, because shop-floor terminals are shared — this
 * is a superset of what `teras_last_username` already remembers.
 */
import { parseRecipe } from './avatarRecipe';

const KEY = 'teras_avatar_cache';
const MAX_REMEMBERED = 8;

interface Entry {
    /** username */
    u: string;
    /** recipe */
    r: string;
}

// Every accessor is guarded: private windows, cleared site data and browsers
// configured to block storage all throw here rather than returning empty, and
// the login screen has a working fallback in every one of those cases.
function read(): Entry[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((e): e is Entry =>
            !!e && typeof e.u === 'string' && typeof e.r === 'string');
    } catch {
        return [];
    }
}

/**
 * Called whenever we learn a user's avatar (login, session restore, profile
 * save). Passing a user with no stored recipe *forgets* them, so resetting an
 * avatar back to the default doesn't leave the login screen showing the old one.
 */
export function rememberAvatar(username: string, avatarId: string | null | undefined): void {
    const user = (username || '').trim();
    if (!user || typeof window === 'undefined') return;

    try {
        const others = read().filter(e => e.u !== user);
        // Only an explicit recipe is worth storing. A user who has never opened
        // the picker is already reproduced exactly by seeding from their
        // username, so there is nothing to remember for them.
        const next = parseRecipe(avatarId)
            ? [{ u: user, r: avatarId as string }, ...others]
            : others;
        window.localStorage.setItem(KEY, JSON.stringify(next.slice(0, MAX_REMEMBERED)));
    } catch {
        // Non-fatal: the login screen falls back to a username-seeded avatar.
    }
}

/** The stored recipe for this user on this device, if we have one. */
export function recallAvatar(username: string): string | null {
    const user = (username || '').trim();
    if (!user) return null;
    return read().find(e => e.u === user)?.r ?? null;
}
