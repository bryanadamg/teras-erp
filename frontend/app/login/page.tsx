'use client';

import { useState, useEffect } from 'react';
import { useUser } from '../context/UserContext';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const { login, currentUser } = useUser();
    const router = useRouter();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [uiStyle, setUiStyle] = useState('classic');

    useEffect(() => {
        const savedStyle = localStorage.getItem('ui_style');
        if (savedStyle) setUiStyle(savedStyle);
        
        // Redirect if already logged in
        if (currentUser) {
            router.push('/');
        }
    }, [currentUser, router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        
        try {
            await login(username, password);
            router.push('/');
        } catch (err: any) {
            setError('Invalid credentials');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={`d-flex align-items-center justify-content-center vh-100 bg-light ui-style-${uiStyle}`}>
            <div className="card shadow border-0" style={{ width: '360px' }}>
                <div className="card-header bg-primary text-white text-center py-3">
                    <h4 className="mb-0 fw-bold"><i className="bi bi-cpu-fill me-2"></i>Teras ERP</h4>
                    <small className="opacity-75">Secure Access</small>
                </div>
                <div className="card-body p-4">
                    {error && (
                        <div className="alert alert-danger d-flex align-items-center small py-2">
                            <i className="bi bi-exclamation-octagon-fill me-2"></i>
                            {error}
                        </div>
                    )}
                    <form onSubmit={handleSubmit}>
                        <div className="mb-3">
                            <label className="form-label small fw-bold text-muted">Username</label>
                            <div className="input-group">
                                <span className="input-group-text"><i className="bi bi-person-fill"></i></span>
                                <input 
                                    type="text" 
                                    className="form-control" 
                                    value={username} 
                                    onChange={e => setUsername(e.target.value)} 
                                    required 
                                    autoFocus
                                />
                            </div>
                        </div>
                        <div className="mb-4">
                            <label className="form-label small fw-bold text-muted">Password</label>
                            <div className="input-group">
                                <span className="input-group-text"><i className="bi bi-lock-fill"></i></span>
                                <input 
                                    type="password" 
                                    className="form-control" 
                                    value={password} 
                                    onChange={e => setPassword(e.target.value)} 
                                    required 
                                />
                            </div>
                        </div>
                        <button type="submit" className="btn btn-primary w-100 fw-bold" disabled={loading}>
                            {loading ? 'Authenticating...' : 'Login'}
                        </button>
                    </form>
                </div>
                <div className="card-footer bg-white text-center py-3">
                    <small className="text-muted">
                        &copy; 2026 Teras Systems
                    </small>
                </div>
            </div>
        </div>
    );
}
