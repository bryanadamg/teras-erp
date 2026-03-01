'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '../context/UserContext';

export default function LoginPage() {
    const { currentUser, login, loading } = useUser();
    const router = useRouter();
    const [loginUser, setLoginUser] = useState('');
    const [loginPass, setLoginPass] = useState('');
    const [loginError, setLoginError] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (mounted && !loading && currentUser) {
            router.push('/');
        }
    }, [currentUser, loading, router, mounted]);

    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoggingIn(true);
        const success = await login(loginUser, loginPass);
        if (!success) setLoginError('Invalid credentials');
        setIsLoggingIn(false);
    };

    if (!mounted || loading) return <div className="d-flex justify-content-center align-items-center vh-100 bg-dark text-info fw-bold font-monospace">SYSTEM_CHECK...</div>;

    return (
        <div className="landing-page vh-100 overflow-hidden position-relative bg-dark d-flex align-items-center">
            <div className="container" style={{zIndex: 10}}>
                <div className="row justify-content-center">
                    <div className="col-md-4">
                        <div className="card shadow-lg p-4 border-0">
                            <div className="text-center mb-4">
                                <h1 className="h3 fw-bold text-primary mb-1">Terras ERP</h1>
                                <p className="text-muted small">Enter your credentials to access the system</p>
                            </div>
                            <form onSubmit={handleLoginSubmit}>
                                <div className="mb-3">
                                    <label htmlFor="username-input" className="form-label small">Username</label>
                                    <input id="username-input" data-testid="username-input" type="text" className="form-control" value={loginUser} onChange={e => setLoginUser(e.target.value)} required />
                                </div>
                                <div className="mb-4">
                                    <label htmlFor="password-input" className="form-label small">Password</label>
                                    <input id="password-input" data-testid="password-input" type="password" size={32} className="form-control" value={loginPass} onChange={e => setLoginPass(e.target.value)} required />
                                </div>
                                {loginError && <div className="alert alert-danger py-2 small" data-testid="login-error">{loginError}</div>}
                                <button type="submit" className="btn btn-primary w-100 fw-bold py-2" data-testid="login-submit" disabled={isLoggingIn}>
                                    {isLoggingIn ? 'Logging in...' : 'Sign In'}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
