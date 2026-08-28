'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '../context/UserContext';
import { useIsMobile } from '../hooks/useIsMobile';
import PixelAvatar from '../components/shared/PixelAvatar';
import { recallAvatar, recallIdentity } from '../components/shared/avatarCache';
import BootSplash, { useBootIndicator } from '../components/shared/BootSplash';
import { modernFont, CHIP_RADIUS } from '../components/shared/xpTheme';

// Wordmark face (Sora, loaded in layout.tsx). Falls back to the system stack
// if the var is missing, so the brand never renders in a default serif.
const brandFont = `var(--font-display), ${modernFont}`;

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api')
    .replace(/\/api$/, '') + '/api';

type SystemStatus = 'checking' | 'ok' | 'degraded' | 'offline';

function useSystemStatus() {
    const [status, setStatus] = useState<SystemStatus>('checking');
    const [version, setVersion] = useState<string | null>(null);
    const [startedAt, setStartedAt] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        const check = async () => {
            try {
                const [healthRes, readyRes] = await Promise.all([
                    fetch(`${API_BASE}/health`),
                    fetch(`${API_BASE}/health/ready`),
                ]);
                if (cancelled) return;
                if (healthRes.ok) {
                    const data = await healthRes.json();
                    setVersion(data.version ?? null);
                    setStartedAt(data.started_at ?? null);
                }
                setStatus(readyRes.ok ? 'ok' : 'degraded');
            } catch {
                if (!cancelled) setStatus('offline');
            }
        };

        check();
        const t = setInterval(check, 20000);
        return () => { cancelled = true; clearInterval(t); };
    }, []);

    return { status, version, startedAt };
}

const STATUS_LABEL: Record<SystemStatus, string> = {
    checking: 'Checking...',
    ok: 'All systems operational',
    degraded: 'Degraded',
    offline: 'Cannot reach server',
};
const STATUS_COLOR: Record<SystemStatus, string> = {
    checking: '#c0c8d8',
    ok: '#5ad06a',
    degraded: '#e8c870',
    offline: '#ff6b5a',
};

function StatusDot({ status }: { status: SystemStatus }) {
    return (
        <span
            style={{
                display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
                background: STATUS_COLOR[status], marginRight: 6,
                boxShadow: status === 'checking' ? 'none' : `0 0 4px ${STATUS_COLOR[status]}`,
            }}
        />
    );
}

// The rest of the Terras Systems suite doesn't exist yet — this is a
// roadmap teaser, not a live module switcher. No visible labels by design;
// `title` gives each tile an accessible/hover name without cluttering the UI.
// Ordered with the active pair (this system) in the middle, so unrelated
// modules fall away toward both edges.
const SUITE_MODULES = [
    { key: 'cms', title: 'CMS', icon: 'bi-file-earmark-richtext-fill', active: false },
    { key: 'pim', title: 'PIM', icon: 'bi-tags-fill', active: false },
    { key: 'hris', title: 'HRIS', icon: 'bi-person-badge-fill', active: false },
    { key: 'accounting', title: 'Accounting', icon: 'bi-calculator-fill', active: false },
    { key: 'mrp', title: 'MRP', icon: 'bi-gear-wide-connected', active: true },
    { key: 'inventory', title: 'Inventory', icon: 'bi-boxes', active: true },
    { key: 'scm', title: 'SCM', icon: 'bi-truck', active: false },
    { key: 'wms', title: 'WMS', icon: 'bi-building', active: false },
    { key: 'crm', title: 'CRM', icon: 'bi-people-fill', active: false },
    { key: 'psa', title: 'PSA', icon: 'bi-briefcase-fill', active: false },
];

/**
 * The user's avatar, and the ID card that forms around it once a username is
 * confirmed - the same card as the sidebar footer's user button (accent spine,
 * photo frame, name, role chip), one size up and without the gear. Deliberately
 * the same object in both places: the badge you see before signing in is the
 * badge you carry inside.
 *
 * `open` drives everything through CSS transitions on ONE set of nodes, which is
 * the whole point of this component's shape. The obvious build - bare avatar at
 * the username step, card at the password step - unmounts the avatar and mounts
 * a different one, so the face blinked out at full opacity and faded back in at
 * a new size. Nothing can transition across an unmount. Here the frame and the
 * PixelAvatar inside it are never replaced: the card face fades in behind them,
 * the frame re-shapes, and the avatar glides left.
 *
 * The closed frame is scaled with `transform`, not sized in px, so the login
 * column's layout height never changes between steps - a scaled element still
 * occupies its untransformed box. Same reason the container is always a third of
 * the column: at rest the chrome is invisible and the avatar is centred inside
 * it, which is exactly where a centred bare avatar would have sat anyway.
 *
 * Name and role are whatever this device cached at the last successful login
 * (see avatarCache) - never a pre-auth lookup, which would confirm to anyone
 * that a given account exists. A username this browser has not signed in
 * before still gets a card; it just shows the username and says the role is
 * confirmed at sign-in. That is the honest state, not a placeholder.
 */
function StaffIdCard({
    open, avatarId, username, fullName, role, compact = false,
}: {
    open: boolean;
    avatarId: string | null;
    username: string;
    fullName?: string;
    role?: string;
    compact?: boolean;
}) {
    const photo = compact ? 44 : 40;
    // Closed, the frame should read at the size the bare avatar used to be.
    const idleScale = (compact ? 60 : 56) / photo;

    // Long and heavily decelerated: the travel is the moment the screen hands
    // the user their badge, so it glides to a stop rather than snapping.
    const glide = 'cubic-bezier(0.16, 0.84, 0.24, 1)';

    return (
        <div
            className={`login-badge${open ? ' login-badge-open' : ''}`}
            style={{
                // A third of the form column, centred: the badge is an identity
                // token, not a panel, so it should not span the field below it.
                position: 'relative',
                width: '33.333%', alignSelf: 'center',
                display: 'flex', alignItems: 'stretch',
                borderRadius: 6,
                overflow: 'hidden',
            }}
        >
            {/* Card face: blue stock rather than white, so it reads as issued by
                the same system as the chrome behind it. A backdrop layer of its
                own, with nothing inside it, so its opacity is nobody else's
                problem - fading the card used to fade the avatar with it. */}
            <div
                aria-hidden
                style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(to bottom, #d6e2f6, #a8c3e7)',
                    borderTop: '1px solid #eaf2fd',
                    borderLeft: '1px solid #eaf2fd',
                    borderRight: '1px solid #5f78a6',
                    borderBottom: '1px solid #5f78a6',
                    borderRadius: 6,
                    boxShadow: '0 2px 8px rgba(0,10,40,0.28)',
                    opacity: open ? 1 : 0,
                    transition: `opacity 420ms ${glide}`,
                }}
            />
            {/* Accent spine - the coloured edge of the ID card. */}
            <div
                aria-hidden
                style={{
                    position: 'relative',
                    width: 4, flexShrink: 0,
                    background: 'linear-gradient(to bottom, #4a7ddb, #003080)',
                    opacity: open ? 1 : 0,
                    transition: `opacity 420ms ${glide}`,
                }}
            />
            <div style={{
                position: 'relative',
                display: 'flex', alignItems: 'center', gap: 9,
                padding: '7px 9px', minWidth: 0, flex: 1,
            }}>
                <div
                    style={{
                        // Closed: centred in the card, at the old bare-avatar
                        // size. Open: pinned left at card size. A percentage
                        // margin resolves against this row's content box, so
                        // "centred" is exact at any width or UI scale - no
                        // measuring, no JS.
                        marginLeft: open ? 0 : `calc(50% - ${photo / 2}px)`,
                        transform: open ? 'none' : `scale(${idleScale})`,
                        width: photo, height: photo, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: open ? '#eaf1fb' : '#c8d8f0',
                        border: open ? '1px solid #6d84b0' : '1px solid #8fa4c8',
                        borderRadius: open ? 4 : 0,
                        boxShadow: 'inset 1px 1px 0 #f4f8ff',
                        transition: [
                            `margin-left 900ms ${glide}`,
                            `transform 900ms ${glide}`,
                            `background-color 420ms ${glide}`,
                            `border-color 420ms ${glide}`,
                            `border-radius 420ms ${glide}`,
                        ].join(', '),
                    }}
                >
                    {/* Size is fixed on purpose: re-rendering PixelAvatar at a
                        new size mid-transition is the pop this component exists
                        to avoid. The frame scales, the face rides along. */}
                    <PixelAvatar avatarId={avatarId} seed={username || 'teras'} size={photo - 10} />
                </div>
                <div style={{
                    minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 1,
                    // Waits for most of the glide, so the details arrive as the
                    // avatar settles instead of racing it across the card.
                    opacity: open ? 1 : 0,
                    transition: open
                        ? `opacity 420ms ${glide} 430ms`
                        : `opacity 140ms ${glide}`,
                }}>
                    <span
                        title={fullName || username}
                        style={{
                            fontSize: compact ? 14 : 13, fontWeight: 'bold', color: '#16294f',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}
                    >
                        {fullName || username}
                    </span>
                    <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: compact ? 10.5 : 10, color: '#3d5480',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                        @{username}
                    </span>
                    {/* Chip when the role is known, plain italic line when it
                        is not - a chip around "confirmed at sign-in" would read
                        as a role called that. */}
                    {role ? (
                        <span style={{
                            marginTop: 2, alignSelf: 'flex-start', maxWidth: '100%',
                            fontSize: compact ? 9.5 : 9, fontWeight: 'bold', letterSpacing: 0.3,
                            textTransform: 'uppercase', padding: '0 4px',
                            borderRadius: CHIP_RADIUS,
                            background: '#bcd0ee',
                            border: '1px solid #7891bd',
                            color: '#16294f',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                            {role}
                        </span>
                    ) : (
                        <span style={{
                            marginTop: 2, fontSize: compact ? 9.5 : 9, color: '#5b6c92',
                            fontStyle: 'italic',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                            Role confirmed at sign-in
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

const ACTIVE_INDICES = SUITE_MODULES
    .map((m, i) => (m.active ? i : -1))
    .filter(i => i >= 0);

function ProductSuitePanel({ compact = false }: { compact?: boolean }) {
    const tileSize = compact ? 40 : 56;
    const iconSize = compact ? 16 : 20;
    const [hovered, setHovered] = useState<string | null>(null);
    const firstActiveRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        firstActiveRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' });
    }, []);

    return (
        <div style={{
            display: 'flex', flexWrap: 'nowrap', justifyContent: 'center',
            gap: compact ? 8 : 10, overflowX: 'auto', overflowY: 'hidden',
            paddingTop: compact ? 34 : 40, paddingBottom: 6, maxWidth: '100%',
        }}>
            {SUITE_MODULES.map((m, i) => {
                const distance = Math.min(...ACTIVE_INDICES.map(a => Math.abs(i - a)));
                const opacity = m.active ? 1 : Math.max(0.2, 1 - distance * 0.2);
                const isHovered = hovered === m.key;
                const baseScale = m.active ? 1 : 1 - distance * 0.04;
                return (
                    <div
                        key={m.key}
                        ref={i === ACTIVE_INDICES[0] ? firstActiveRef : undefined}
                        onMouseEnter={() => setHovered(m.key)}
                        onMouseLeave={() => setHovered(null)}
                        style={{
                            position: 'relative', flexShrink: 0,
                            zIndex: isHovered ? 5 : 1,
                        }}
                    >
                        <div
                            style={{
                                position: 'absolute', bottom: '115%', left: '50%',
                                transform: `translateX(-50%) translateY(${isHovered ? 0 : 4}px)`,
                                opacity: isHovered ? 1 : 0,
                                transition: 'opacity 0.15s ease, transform 0.15s ease',
                                pointerEvents: 'none', whiteSpace: 'nowrap',
                                fontSize: compact ? 10 : 11, color: 'white', fontWeight: 600,
                                background: 'rgba(10,20,60,0.92)', border: '1px solid rgba(166,202,240,0.4)',
                                borderRadius: 4, padding: '3px 8px',
                            }}
                        >
                            {m.title}
                        </div>
                        <div
                            style={{
                                width: tileSize, height: tileSize,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                borderRadius: 6,
                                opacity: isHovered ? 1 : opacity,
                                transform: `scale(${isHovered ? baseScale * 1.15 : baseScale})`,
                                transformOrigin: 'center bottom',
                                transition: 'transform 0.15s ease, opacity 0.15s ease, box-shadow 0.15s ease',
                                background: m.active ? 'rgba(74,144,217,0.28)' : 'rgba(255,255,255,0.05)',
                                border: m.active ? '2px solid #4a90d9' : '1px solid rgba(166,202,240,0.2)',
                                boxShadow: m.active
                                    ? '0 0 8px rgba(74,144,217,0.6)'
                                    : isHovered ? '0 0 8px rgba(166,202,240,0.4)' : 'none',
                                cursor: 'default',
                            }}
                        >
                            <i
                                className={`bi ${m.icon}`}
                                style={{
                                    fontSize: iconSize,
                                    color: m.active || isHovered ? 'white' : '#5f7aa8',
                                    transition: 'color 0.15s ease',
                                }}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default function LoginPage() {
    const { currentUser, login, loading, bootPhase } = useUser();
    const router = useRouter();
    const isMobile = useIsMobile();

    const [mounted, setMounted] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());

    const [usernameInput, setUsernameInput] = useState('');

    const [step, setStep] = useState<'username' | 'password'>('username');
    // Which way the step panes slide. Forward on Next, mirrored on Back, so the
    // motion says "advancing" vs "returning" rather than just "something moved".
    const [stepDir, setStepDir] = useState<'forward' | 'back'>('forward');
    const [selectedUsername, setSelectedUsername] = useState('');
    const [password, setPassword] = useState('');

    // Whose avatar the badge shows. Deliberately not `usernameInput` — driving
    // it from live keystrokes would morph the face on every character typed.
    // It settles on the remembered user at boot, then on whoever is confirmed.
    const [avatarUsername, setAvatarUsername] = useState('');

    const [loginError, setLoginError] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    const passwordRef = useRef<HTMLInputElement>(null);
    const usernameRef = useRef<HTMLInputElement>(null);

    const { status: systemStatus, version, startedAt } = useSystemStatus();
    const lastUpdated = startedAt
        ? new Date(startedAt).toLocaleString('en-US', {
            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
        })
        : null;

    // Boot gate: hydration, plus the /users/me round-trip when a token is
    // already stored (without it, a returning user sees the login form flash
    // before being bounced to the dashboard).
    const booting = !mounted || loading;
    const showBoot = useBootIndicator(booting);

    // Gated on `mounted`: localStorage doesn't exist during prerender, and
    // reading it while rendering would desync the hydrated markup. Falls back
    // to a username-seeded avatar, which is already exactly what an
    // uncustomised user sees everywhere else in the app.
    const rememberedAvatar = useMemo(
        () => (mounted ? recallAvatar(avatarUsername) : null),
        [mounted, avatarUsername],
    );

    // Same device-local source as the avatar: name/role this browser learned at
    // the last successful login, or null for a username it has never seen.
    const rememberedIdentity = useMemo(
        () => (mounted ? recallIdentity(avatarUsername) : null),
        [mounted, avatarUsername],
    );

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        const saved = window.localStorage.getItem('teras_last_username');
        if (saved) {
            setUsernameInput(saved);
            setAvatarUsername(saved);
        }
    }, []);

    useEffect(() => {
        const t = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    useEffect(() => {
        if (mounted && !loading && currentUser) router.push('/dashboard');
    }, [currentUser, loading, mounted, router]);

    useEffect(() => {
        if (step === 'password') {
            setTimeout(() => passwordRef.current?.focus(), 50);
        }
    }, [step]);

    const confirmUsername = (username: string) => {
        setStepDir('forward');
        setSelectedUsername(username);
        setAvatarUsername(username);
        setStep('password');
        setLoginError('');
        window.localStorage.setItem('teras_last_username', username);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoggingIn(true);
        setLoginError('');
        const result = await login(selectedUsername, password);
        if (result !== true) {
            setLoginError(result === 'network_error' ? 'Cannot reach server — check your connection' : 'Invalid username or password');
            setIsLoggingIn(false);
        }
    };

    const handleBack = () => {
        setStepDir('back');
        setStep('username');
        setUsernameInput(selectedUsername);
        setSelectedUsername('');
        setPassword('');
        setLoginError('');
        setTimeout(() => usernameRef.current?.focus(), 50);
    };

    // Both layout branches render the same pane classes; the animation itself
    // lives in globals.css (`login-step*`).
    const stepClass = `login-step${stepDir === 'back' ? ' login-step-back' : ''}`;

    const formatTime = (d: Date) =>
        d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const formatDate = (d: Date) =>
        d.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    // Splash only once the wait has earned it; below SHOW_DELAY the screen stays
    // empty rather than flashing. `showBoot` can outlast `booting` — that's the
    // min-visible floor holding a splash that did appear.
    if (showBoot) {
        return <BootSplash phase={mounted ? bootPhase : 'hydrating'} />;
    }
    if (booting) return null;

    if (isMobile) {
        return (
            <div
                style={{
                    minHeight: 'var(--app-vh)', width: '100%',
                    background: 'linear-gradient(135deg, #0d1f5c 0%, #1a3fa8 40%, #0a246a 100%)',
                    fontFamily: modernFont,
                    display: 'flex', flexDirection: 'column', overflowY: 'auto',
                }}
            >
                {/* Mobile header */}
                <div style={{ padding: '32px 28px 20px', textAlign: 'center' }}>
                    <div style={{
                        display: 'flex', alignItems: 'baseline', justifyContent: 'center',
                        gap: 6, marginBottom: 4,
                    }}>
                        <span style={{
                            fontFamily: brandFont, fontSize: 30, fontWeight: 600,
                            letterSpacing: 0, color: 'white',
                        }}>
                            Terras
                        </span>
                        <span style={{
                            fontFamily: brandFont, fontSize: 11, fontWeight: 500,
                            letterSpacing: 2, textTransform: 'uppercase', color: '#7f9ecb',
                        }}>
                            ERP
                        </span>
                    </div>
                    <div style={{ fontSize: 11, color: '#a0c2f5', letterSpacing: 4, textTransform: 'uppercase' }}>
                        Integrated Business Suite
                    </div>
                </div>

                {/* Mobile suite panel */}
                <div style={{ padding: '0 28px 8px', display: 'flex', justifyContent: 'center' }}>
                    <ProductSuitePanel compact />
                </div>

                {/* Mobile form */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: '0 28px 40px' }}>
                    {/* Always mounted: the avatar is the photo on the ID card
                        that forms around it, and swapping components at the step
                        change is exactly what made it flash. The card carries the
                        name, so there is no separate name line. */}
                    <StaffIdCard
                        compact
                        open={step === 'password'}
                        avatarId={rememberedAvatar}
                        username={selectedUsername || avatarUsername}
                        fullName={rememberedIdentity?.fullName}
                        role={rememberedIdentity?.role}
                    />

                    {/* Keyed on `step` so the copy re-mounts and fades instead of
                        swapping mid-sentence under the reader. */}
                    <div key={step} className="login-identity" style={{ fontSize: 13, color: '#b8ccf0', textAlign: 'center' }}>
                        {step === 'username' ? 'Enter your username to sign in' : 'Enter your password to continue'}
                    </div>

                    <form
                        /* The clipped-text hover in GlobalTooltip walks up to 3
                           ancestors and echoes the textContent of any box wider
                           than itself. At narrow widths this form qualifies, and
                           what it echoed was every label and button on it run
                           together ("PasswordForgot your password?...BackSign
                           In"). Nothing here is a clipped label, so the form opts
                           out; the ID card's own `title` sits outside it. */
                        data-no-tip
                        onSubmit={step === 'password'
                            ? handleSubmit
                            : (e) => {
                                e.preventDefault();
                                if (usernameInput.trim()) confirmUsername(usernameInput.trim());
                            }
                        }
                        style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}
                    >
                        {step === 'username' && (
                            <div className={stepClass}>
                                <div style={{ fontSize: 12, color: '#c0d8f8', marginBottom: 6 }}>Username</div>
                                <input
                                    ref={usernameRef}
                                    id="username-input"
                                    data-testid="username-input"
                                    type="text"
                                    autoComplete="username"
                                    value={usernameInput}
                                    onChange={e => setUsernameInput(e.target.value)}
                                    style={{
                                        width: '100%', height: 48,
                                        background: 'rgba(255,255,255,0.12)',
                                        border: '1px solid rgba(166,202,240,0.6)',
                                        borderRadius: 3, color: 'white', padding: '0 14px',
                                        fontSize: 16, outline: 'none', boxSizing: 'border-box',
                                    }}
                                    required
                                />
                            </div>
                        )}

                        {step === 'password' && (
                            <div className={stepClass}>
                                <div style={{ fontSize: 12, color: '#e8c870', marginBottom: 6 }}>Password</div>
                                <input
                                    ref={passwordRef}
                                    id="password-input"
                                    data-testid="password-input"
                                    type="password"
                                    autoComplete="current-password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    style={{
                                        width: '100%', height: 48,
                                        background: 'rgba(255,255,255,0.12)',
                                        border: '1px solid rgba(232,200,112,0.5)',
                                        borderRadius: 3, color: 'white', padding: '0 14px',
                                        fontSize: 16, outline: 'none', boxSizing: 'border-box',
                                    }}
                                    required
                                />
                                <div style={{ fontSize: 12, color: '#9fb8dc', marginTop: 8 }}>
                                    Forgot your password? Contact your supervisor or IT.
                                </div>
                            </div>
                        )}

                        {loginError && (
                            <div
                                data-testid="login-error"
                                style={{
                                    fontSize: 13, color: '#ff9080',
                                    background: 'rgba(180,40,20,0.25)',
                                    border: '1px solid rgba(180,40,20,0.4)',
                                    borderRadius: 3, padding: '10px 12px',
                                }}
                            >
                                <div>{loginError}</div>
                                <button
                                    type="button"
                                    onClick={handleBack}
                                    style={{
                                        background: 'none', border: 'none', padding: 0, marginTop: 6,
                                        color: '#ffc0b0', textDecoration: 'underline', fontSize: 12,
                                        cursor: 'pointer',
                                    }}
                                >
                                    <i className="bi bi-arrow-left" style={{ marginRight: 4 }} />Try a different username
                                </button>
                            </div>
                        )}

                        <div style={{
                            display: 'flex',
                            justifyContent: step === 'password' ? 'space-between' : 'flex-end',
                            gap: 10, marginTop: 4,
                        }}>
                            {step === 'password' && (
                                <button
                                    type="button"
                                    onClick={handleBack}
                                    style={{
                                        background: 'linear-gradient(to bottom,#607090,#404860)',
                                        border: '1px solid rgba(100,130,180,0.4)', borderRadius: 3,
                                        color: 'white', fontSize: 14,
                                        padding: '0 20px', minHeight: 48,
                                        cursor: 'pointer', flex: 1,
                                    }}
                                >
                                    <i className="bi bi-arrow-left" style={{ marginRight: 6 }} />Back
                                </button>
                            )}
                            <button
                                type="submit"
                                data-testid="login-submit"
                                disabled={isLoggingIn}
                                style={{
                                    background: isLoggingIn
                                        ? 'linear-gradient(to bottom,#3a6090,#1a3a6a)'
                                        : 'linear-gradient(to bottom,#4a90d9,#2563c4)',
                                    border: '1px solid #0a246a', borderRadius: 3,
                                    color: 'white', fontSize: 15, fontWeight: 600,
                                    padding: '0 20px', minHeight: 48,
                                    cursor: isLoggingIn ? 'not-allowed' : 'pointer',
                                    flex: 1,
                                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
                                }}
                            >
                                {isLoggingIn ? 'Signing in...' : step === 'username' ? (<>Next <i className="bi bi-arrow-right" style={{ marginLeft: 4 }} /></>) : (<>Sign In <i className="bi bi-arrow-right" style={{ marginLeft: 4 }} /></>)}
                            </button>
                        </div>
                    </form>
                </div>

                {/* Mobile clock + docs */}
                <div style={{ padding: '0 28px 24px', textAlign: 'center', fontSize: 12, color: '#a8bee0', lineHeight: 1.6 }}>
                    {formatTime(currentTime)} · {formatDate(currentTime)}
                    <div style={{ marginTop: 8 }}>
                        <a
                            href="/docs"
                            className="login-docs-link"
                            style={{
                                fontSize: 12,
                                color: '#a8cef2',
                                textDecoration: 'none',
                                border: '1px solid rgba(122,176,232,0.3)',
                                borderRadius: 3,
                                padding: '4px 10px',
                                display: 'inline-block',
                            }}
                        >
                            <i className="bi bi-journal-text" style={{ marginRight: 4 }} />View Documentation
                        </a>
                    </div>
                    <div style={{ marginTop: 10, fontSize: 10, color: '#7f97c0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <StatusDot status={systemStatus} />
                        {STATUS_LABEL[systemStatus]}
                        {version && <span style={{ opacity: 0.6 }}>· v{version}</span>}
                    </div>
                    {lastUpdated && (
                        <div style={{ marginTop: 2, fontSize: 10, color: '#7f97c0', opacity: 0.6 }}>
                            Last updated {lastUpdated}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    const stripeBase: React.CSSProperties = {
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        padding: 'clamp(16px, calc(var(--app-vh) * 3 / 100), 40px) 6%',
    };

    return (
        <div
            style={{
                minHeight: 'var(--app-vh)', width: '100%',
                background: 'linear-gradient(135deg, #0d1f5c 0%, #1a3fa8 40%, #0a246a 100%)',
                fontFamily: modernFont,
                display: 'flex', flexDirection: 'column', overflowY: 'auto',
            }}
        >
            {/* Top stripe */}
            <div style={{
                ...stripeBase,
                background: 'linear-gradient(to bottom, rgba(255,255,255,0.08) 0%, transparent 100%)',
                borderBottom: '1px solid rgba(166,202,240,0.15)',
                justifyContent: 'space-between',
            }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {/* "Terras" is the suite; "ERP" is only the module you're
                        logging into, so it rides small and muted beside the
                        wordmark rather than sharing its weight. */}
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 'clamp(4px,calc(var(--app-vw) * 0.5 / 100),9px)' }}>
                        <span style={{
                            fontFamily: brandFont,
                            fontSize: 'clamp(21px,calc(var(--app-vw) * 3.6 / 100),44px)', fontWeight: 600,
                            letterSpacing: -0.1, color: 'white',
                        }}>
                            Terras
                        </span>
                        <span style={{
                            fontFamily: brandFont,
                            fontSize: 'clamp(9px,calc(var(--app-vw) * 1.2 / 100),15px)', fontWeight: 500,
                            letterSpacing: 3, textTransform: 'uppercase', color: '#7f9ecb',
                        }}>
                            ERP
                        </span>
                    </div>
                    <div style={{
                        fontSize: 'clamp(8px,calc(var(--app-vw) * 1.1 / 100),13px)', color: '#a0c2f5',
                        letterSpacing: 5, textTransform: 'uppercase',
                    }}>
                        Integrated Business Suite
                    </div>
                </div>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <div style={{ fontSize: 'clamp(7px,calc(var(--app-vw) * 0.9 / 100),11px)', color: '#9fb8dc', lineHeight: 1.9, letterSpacing: 1 }}>
                        Production · Stock · Sales<br />
                        BOM · Work Orders · Reports
                    </div>
                    <a
                        href="/docs"
                        className="login-docs-link"
                        style={{
                            fontSize: 'clamp(9px,calc(var(--app-vw) * 0.9 / 100),11px)',
                            color: '#a8cef2',
                            textDecoration: 'none',
                            border: '1px solid rgba(122,176,232,0.3)',
                            borderRadius: 3,
                            padding: 'clamp(2px,calc(var(--app-vw) * 0.4 / 100),4px) clamp(6px,calc(var(--app-vw) * 1 / 100),10px)',
                        }}
                    >
                        <i className="bi bi-journal-text" style={{ marginRight: 4 }} />View Documentation
                    </a>
                </div>
            </div>

            {/* Center */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

                {/* Left: product suite */}
                <div style={{
                    flex: 1, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', gap: 16, padding: '0 4%',
                }}>
                    <ProductSuitePanel />
                    <div style={{
                        width: '60%', height: 1,
                        background: 'linear-gradient(to right, transparent, rgba(166,202,240,0.5), transparent)',
                    }} />
                    <div key={step} className="login-identity" style={{ fontSize: 'clamp(9px,calc(var(--app-vw) * 1.2 / 100),14px)', color: '#b8ccf0', letterSpacing: 1 }}>
                        {step === 'username' ? 'Type your username to sign in' : 'Enter your password to continue'}
                    </div>
                </div>

                {/* Vertical divider */}
                <div style={{
                    width: 1, alignSelf: 'stretch', margin: '0 2%',
                    background: 'linear-gradient(to bottom, transparent, rgba(166,202,240,0.35), transparent)',
                }} />

                {/* Right: form */}
                <div style={{
                    minWidth: '38%', maxWidth: '420px', padding: '0 5%',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                }}>
                    {/* Avatar -> ID card, as on mobile */}
                    <StaffIdCard
                        open={step === 'password'}
                        avatarId={rememberedAvatar}
                        username={selectedUsername || avatarUsername}
                        fullName={rememberedIdentity?.fullName}
                        role={rememberedIdentity?.role}
                    />

                    <form
                        /* Same opt-out as the mobile form above. */
                        data-no-tip
                        onSubmit={step === 'password'
                            ? handleSubmit
                            : (e) => {
                                e.preventDefault();
                                if (usernameInput.trim()) confirmUsername(usernameInput.trim());
                            }
                        }
                        style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}
                    >
                        {step === 'username' && (
                            <div className={stepClass}>
                                <div style={{ fontSize: 'clamp(9px,calc(var(--app-vw) * 1.1 / 100),12px)', color: '#c0d8f8', marginBottom: 4 }}>
                                    Username
                                </div>
                                <input
                                    ref={usernameRef}
                                    id="username-input"
                                    data-testid="username-input"
                                    type="text"
                                    autoFocus
                                    autoComplete="username"
                                    value={usernameInput}
                                    onChange={e => setUsernameInput(e.target.value)}
                                    style={{
                                        width: '100%', height: 'clamp(24px,calc(var(--app-vw) * 3 / 100),36px)',
                                        background: 'rgba(255,255,255,0.15)',
                                        border: '1px solid rgba(166,202,240,0.6)',
                                        borderRadius: 3, color: 'white', padding: '0 8px',
                                        fontSize: 'clamp(9px,calc(var(--app-vw) * 1.1 / 100),13px)', outline: 'none',
                                    }}
                                    required
                                />
                            </div>
                        )}

                        {step === 'password' && (
                            <div className={stepClass}>
                                <div style={{ fontSize: 'clamp(9px,calc(var(--app-vw) * 1.1 / 100),12px)', color: '#e8c870', marginBottom: 4 }}>
                                    Password
                                </div>
                                <input
                                    ref={passwordRef}
                                    id="password-input"
                                    data-testid="password-input"
                                    type="password"
                                    autoComplete="current-password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    style={{
                                        width: '100%', height: 'clamp(24px,calc(var(--app-vw) * 3 / 100),36px)',
                                        background: 'rgba(255,255,255,0.15)',
                                        border: '1px solid rgba(232,200,112,0.5)',
                                        borderRadius: 3, color: 'white', padding: '0 8px',
                                        fontSize: 'clamp(9px,calc(var(--app-vw) * 1.1 / 100),13px)', outline: 'none',
                                    }}
                                    required
                                />
                                <div style={{ fontSize: 'clamp(8px,calc(var(--app-vw) * 0.9 / 100),11px)', color: '#9fb8dc', marginTop: 6 }}>
                                    Forgot your password? Contact your supervisor or IT.
                                </div>
                            </div>
                        )}

                        {loginError && (
                            <div
                                data-testid="login-error"
                                style={{
                                    fontSize: 'clamp(8px,calc(var(--app-vw) * 1 / 100),11px)', color: '#ff9080',
                                    background: 'rgba(180,40,20,0.25)',
                                    border: '1px solid rgba(180,40,20,0.4)',
                                    borderRadius: 3, padding: '4px 8px',
                                }}
                            >
                                <div>{loginError}</div>
                                <button
                                    type="button"
                                    onClick={handleBack}
                                    style={{
                                        background: 'none', border: 'none', padding: 0, marginTop: 4,
                                        color: '#ffc0b0', textDecoration: 'underline',
                                        fontSize: 'clamp(8px,calc(var(--app-vw) * 0.9 / 100),11px)', cursor: 'pointer',
                                    }}
                                >
                                    <i className="bi bi-arrow-left" style={{ marginRight: 4 }} />Try a different username
                                </button>
                            </div>
                        )}

                        <div style={{
                            display: 'flex',
                            justifyContent: step === 'password' ? 'space-between' : 'flex-end',
                            gap: 8, marginTop: 4,
                        }}>
                            {step === 'password' && (
                                <button
                                    type="button"
                                    onClick={handleBack}
                                    style={{
                                        background: 'linear-gradient(to bottom,#607090,#404860)',
                                        border: '1px solid rgba(100,130,180,0.4)', borderRadius: 3,
                                        color: 'white', fontSize: 'clamp(8px,calc(var(--app-vw) * 1 / 100),12px)',
                                        padding: 'clamp(3px,calc(var(--app-vw) * 0.5 / 100),6px) clamp(10px,calc(var(--app-vw) * 2 / 100),20px)',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <i className="bi bi-arrow-left" style={{ marginRight: 6 }} />Back
                                </button>
                            )}
                            <button
                                type="submit"
                                data-testid="login-submit"
                                disabled={isLoggingIn}
                                style={{
                                    background: isLoggingIn
                                        ? 'linear-gradient(to bottom,#3a6090,#1a3a6a)'
                                        : 'linear-gradient(to bottom,#4a90d9,#2563c4)',
                                    border: '1px solid #0a246a', borderRadius: 3,
                                    color: 'white', fontSize: 'clamp(8px,calc(var(--app-vw) * 1 / 100),12px)',
                                    padding: 'clamp(3px,calc(var(--app-vw) * 0.5 / 100),6px) clamp(10px,calc(var(--app-vw) * 2 / 100),20px)',
                                    cursor: isLoggingIn ? 'not-allowed' : 'pointer',
                                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
                                }}
                            >
                                {isLoggingIn ? 'Signing in...' : step === 'username' ? (<>Next <i className="bi bi-arrow-right" style={{ marginLeft: 4 }} /></>) : (<>Sign In <i className="bi bi-arrow-right" style={{ marginLeft: 4 }} /></>)}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {/* Bottom stripe: status/version + clock */}
            <div style={{
                ...stripeBase,
                background: 'linear-gradient(to top, rgba(0,0,60,0.7) 0%, transparent 100%)',
                borderTop: '1px solid rgba(166,202,240,0.1)',
                justifyContent: 'space-between',
            }}>
                <div style={{
                    fontSize: 'clamp(8px,calc(var(--app-vw) * 1 / 100),12px)', color: '#a8bee0',
                    lineHeight: 1.6,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <StatusDot status={systemStatus} />
                        {STATUS_LABEL[systemStatus]}
                        {version && <span style={{ marginLeft: 8, opacity: 0.6 }}>v{version}</span>}
                    </div>
                    {lastUpdated && <div style={{ opacity: 0.6 }}>Last updated {lastUpdated}</div>}
                </div>
                <div style={{ textAlign: 'right', fontSize: 'clamp(8px,calc(var(--app-vw) * 1 / 100),12px)', color: '#a8bee0', lineHeight: 1.6 }}>
                    {formatTime(currentTime)}<br />
                    {formatDate(currentTime)}
                </div>
            </div>
        </div>
    );
}
