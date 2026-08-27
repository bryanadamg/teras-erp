/**
 * Remembers signed-in users' avatar recipes — and the name/role that go on the
 * login screen's staff ID card — in this browser, so the login screen can show
 * someone their own face and badge before they authenticate.
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
    /** avatar recipe */
    r?: string;
    /** full name */
    n?: string;
    /** role name */
    ro?: string;
}

/** Everything the login screen's staff ID card can show pre-auth. */
export interface CachedIdentity {
    fullName?: string;
    role?: string;
}

// One list, one cap, one key: an entry is the whole of what this device
// remembers about a user, so avatar and badge facts can't fall out of sync or
// evict each other. An entry with nothing left in it is dropped.
function isEmpty(e: Entry): boolean {
    return !e.r && !e.n && !e.ro;
}

function write(entries: Entry[]): void {
    try {
        window.localStorage.setItem(KEY, JSON.stringify(entries.filter(e => !isEmpty(e)).slice(0, MAX_REMEMBERED)));
    } catch {
        // Non-fatal: the login screen falls back to a username-seeded avatar
        // and a card that shows only the username.
    }
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
            !!e && typeof (e as Entry).u === 'string');
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

    const all = read();
    const mine = all.find(e => e.u === user);
    const others = all.filter(e => e.u !== user);
    // Only an explicit recipe is worth storing. A user who has never opened
    // the picker is already reproduced exactly by seeding from their
    // username, so there is nothing to remember for them. Dropping the recipe
    // must not drop their name/role — those are a separate fact about the same
    // person, which is why this rebuilds the entry instead of replacing it.
    write([{ ...mine, u: user, r: parseRecipe(avatarId) ? (avatarId as string) : undefined }, ...others]);
}

/**
 * Called alongside rememberAvatar once a user is authenticated. The ID card is
 * the reason this exists: name and role live behind auth, and a pre-auth lookup
 * by username would confirm to anyone that an account exists. Cached after a
 * successful login instead — nothing extra leaves the server, and the card
 * simply shows less for a user this device has never signed in.
 */
export function rememberIdentity(username: string, identity: CachedIdentity): void {
    const user = (username || '').trim();
    if (!user || typeof window === 'undefined') return;

    const all = read();
    const mine = all.find(e => e.u === user);
    const others = all.filter(e => e.u !== user);
    write([{
        ...mine,
        u: user,
        n: identity.fullName?.trim() || undefined,
        ro: identity.role?.trim() || undefined,
    }, ...others]);
}

/** The name/role this device remembers for a user, if any. */
export function recallIdentity(username: string): CachedIdentity | null {
    const user = (username || '').trim();
    if (!user) return null;
    const e = read().find(x => x.u === user);
    if (!e || (!e.n && !e.ro)) return null;
    return { fullName: e.n, role: e.ro };
}

/** The stored recipe for this user on this device, if we have one. */
export function recallAvatar(username: string): string | null {
    const user = (username || '').trim();
    if (!user) return null;
    return read().find(e => e.u === user)?.r ?? null;
}
