'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '../context/UserContext';
import { useIsMobile } from '../hooks/useIsMobile';
import PixelAvatar from '../components/shared/PixelAvatar';
import { XPLoading } from '../components/shared/xpTheme';

export default function LoginPage() {
    const { currentUser, login, loading } = useUser();
    const router = useRouter();
    const isMobile = useIsMobile();

    const [mounted, setMounted] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());

    const [usernameInput, setUsernameInput] = useState('');

    const [step, setStep] = useState<'username' | 'password'>('username');
    const [selectedUsername, setSelectedUsername] = useState('');
    const [password, setPassword] = useState('');

    const [loginError, setLoginError] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    const passwordRef = useRef<HTMLInputElement>(null);
    const usernameRef = useRef<HTMLInputElement>(null);

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        const saved = window.localStorage.getItem('teras_last_username');
        if (saved) setUsernameInput(saved);
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
        setSelectedUsername(username);
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
        setStep('username');
        setUsernameInput(selectedUsername);
        setSelectedUsername('');
        setPassword('');
        setLoginError('');
        setTimeout(() => usernameRef.current?.focus(), 50);
    };

    const formatTime = (d: Date) =>
        d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const formatDate = (d: Date) =>
        d.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    if (!mounted || loading) {
        return <XPLoading label="Starting Teras ERP..." fullScreen />;
    }

    if (isMobile) {
        return (
            <div
                style={{
                    minHeight: '100vh', width: '100%',
                    background: 'linear-gradient(135deg, #0d1f5c 0%, #1a3fa8 40%, #0a246a 100%)',
                    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
                    display: 'flex', flexDirection: 'column', overflowY: 'auto',
                }}
            >
                {/* Mobile header */}
                <div style={{ padding: '32px 28px 20px', textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: 1, color: 'white', marginBottom: 4 }}>
                        Teras ERP
                    </div>
                    <div style={{ fontSize: 11, color: '#a0c2f5', letterSpacing: 4, textTransform: 'uppercase' }}>
                        Manufacturing &amp; Inventory
                    </div>
                </div>

                {/* Mobile form */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: '0 28px 40px' }}>
                    {/* Avatar */}
                    <div style={{
                        width: 60, height: 60,
                        background: '#c8d8f0',
                        border: '2px solid',
                        borderColor: '#fff #888 #888 #fff',
                        boxShadow: 'inset 1px 1px 0 rgba(255,255,255,0.4)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <PixelAvatar avatarId="1" size={48} />
                    </div>

                    {step === 'password' && (
                        <div style={{ textAlign: 'center', fontSize: 16, color: 'white', fontWeight: 600 }}>
                            {selectedUsername}
                        </div>
                    )}

                    <div style={{ fontSize: 13, color: '#b8ccf0', textAlign: 'center' }}>
                        {step === 'username' ? 'Enter your username to sign in' : 'Enter your password to continue'}
                    </div>

                    <form
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
                            <div>
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
                            <div>
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
                </div>
            </div>
        );
    }

    const stripeBase: React.CSSProperties = {
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        padding: 'clamp(16px, 3vh, 40px) 6%',
    };

    return (
        <div
            style={{
                minHeight: '100vh', width: '100%',
                background: 'linear-gradient(135deg, #0d1f5c 0%, #1a3fa8 40%, #0a246a 100%)',
                fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
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
                    <div style={{
                        fontSize: 'clamp(20px,3.5vw,42px)', fontWeight: 600,
                        letterSpacing: 1, color: 'white',
                    }}>
                        Teras ERP
                    </div>
                    <div style={{
                        fontSize: 'clamp(8px,1.1vw,13px)', color: '#a0c2f5',
                        letterSpacing: 5, textTransform: 'uppercase',
                    }}>
                        Manufacturing &amp; Inventory
                    </div>
                </div>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <div style={{ fontSize: 'clamp(7px,0.9vw,11px)', color: '#9fb8dc', lineHeight: 1.9, letterSpacing: 1 }}>
                        Production · Stock · Sales<br />
                        BOM · Work Orders · Reports
                    </div>
                    <a
                        href="/docs"
                        style={{
                            fontSize: 'clamp(9px,0.9vw,11px)',
                            color: '#a8cef2',
                            textDecoration: 'none',
                            border: '1px solid rgba(122,176,232,0.3)',
                            borderRadius: 3,
                            padding: 'clamp(2px,0.4vw,4px) clamp(6px,1vw,10px)',
                        }}
                    >
                        <i className="bi bi-journal-text" style={{ marginRight: 4 }} />View Documentation
                    </a>
                </div>
            </div>

            {/* Center */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

                {/* Left: instruction */}
                <div style={{
                    flex: 1, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', gap: 8, padding: '0 4%',
                }}>
                    <div style={{
                        width: '60%', height: 1,
                        background: 'linear-gradient(to right, transparent, rgba(166,202,240,0.5), transparent)',
                    }} />
                    <div style={{ fontSize: 'clamp(9px,1.2vw,14px)', color: '#b8ccf0', letterSpacing: 1 }}>
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
                    {/* Avatar */}
                    <div style={{
                        width: 'clamp(40px,6vw,64px)', height: 'clamp(40px,6vw,64px)',
                        background: '#c8d8f0',
                        border: '2px solid',
                        borderColor: '#fff #888 #888 #fff',
                        boxShadow: 'inset 1px 1px 0 rgba(255,255,255,0.4)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <PixelAvatar avatarId="1" size={48} />
                    </div>

                    {step === 'password' && (
                        <div style={{ fontSize: 'clamp(10px,1.3vw,15px)', color: 'white', fontWeight: 600 }}>
                            {selectedUsername}
                        </div>
                    )}

                    <form
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
                            <div>
                                <div style={{ fontSize: 'clamp(9px,1.1vw,12px)', color: '#c0d8f8', marginBottom: 4 }}>
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
                                        width: '100%', height: 'clamp(24px,3vw,36px)',
                                        background: 'rgba(255,255,255,0.15)',
                                        border: '1px solid rgba(166,202,240,0.6)',
                                        borderRadius: 3, color: 'white', padding: '0 8px',
                                        fontSize: 'clamp(9px,1.1vw,13px)', outline: 'none',
                                    }}
                                    required
                                />
                            </div>
                        )}

                        {step === 'password' && (
                            <div>
                                <div style={{ fontSize: 'clamp(9px,1.1vw,12px)', color: '#e8c870', marginBottom: 4 }}>
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
                                        width: '100%', height: 'clamp(24px,3vw,36px)',
                                        background: 'rgba(255,255,255,0.15)',
                                        border: '1px solid rgba(232,200,112,0.5)',
                                        borderRadius: 3, color: 'white', padding: '0 8px',
                                        fontSize: 'clamp(9px,1.1vw,13px)', outline: 'none',
                                    }}
                                    required
                                />
                                <div style={{ fontSize: 'clamp(8px,0.9vw,11px)', color: '#9fb8dc', marginTop: 6 }}>
                                    Forgot your password? Contact your supervisor or IT.
                                </div>
                            </div>
                        )}

                        {loginError && (
                            <div
                                data-testid="login-error"
                                style={{
                                    fontSize: 'clamp(8px,1vw,11px)', color: '#ff9080',
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
                                        fontSize: 'clamp(8px,0.9vw,11px)', cursor: 'pointer',
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
                                        color: 'white', fontSize: 'clamp(8px,1vw,12px)',
                                        padding: 'clamp(3px,0.5vw,6px) clamp(10px,2vw,20px)',
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
                                    color: 'white', fontSize: 'clamp(8px,1vw,12px)',
                                    padding: 'clamp(3px,0.5vw,6px) clamp(10px,2vw,20px)',
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

            {/* Bottom stripe: clock only */}
            <div style={{
                ...stripeBase,
                background: 'linear-gradient(to top, rgba(0,0,60,0.7) 0%, transparent 100%)',
                borderTop: '1px solid rgba(166,202,240,0.1)',
                justifyContent: 'flex-end',
            }}>
                <div style={{ textAlign: 'right', fontSize: 'clamp(8px,1vw,12px)', color: '#a8bee0', lineHeight: 1.6 }}>
                    {formatTime(currentTime)}<br />
                    {formatDate(currentTime)}
                </div>
            </div>
        </div>
    );
}
