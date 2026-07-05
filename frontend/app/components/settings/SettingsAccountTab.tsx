'use client';

import { useState, useEffect } from 'react';
import { useToast } from '../shared/Toast';
import { useTheme } from '../../context/ThemeContext';
import { useUser } from '../../context/UserContext';
import { xpBtn, xpInput, xpLabel } from '../shared/xpTheme';
import { xpBevel, xpTitleBar } from './settingsStyles';
import PixelAvatar from '../shared/PixelAvatar';
import AvatarPicker from '../shared/AvatarPicker';
import { API_BASE } from '../shared/apiBase';

export default function SettingsAccountTab() {
    const { showToast } = useToast();
    const { currentUser, setCurrentUser } = useUser();
    const { uiStyle } = useTheme();
    const classic = uiStyle === 'classic';

    const [selfUsername, setSelfUsername] = useState('');
    const [selfFullName, setSelfFullName] = useState('');
    const [selfPassword, setSelfPassword] = useState('');
    const [selfConfirmPassword, setSelfConfirmPassword] = useState('');
    const [selfAvatarId, setSelfAvatarId] = useState<string>('1');

    useEffect(() => {
        if (currentUser) {
            setSelfUsername(currentUser.username);
            setSelfFullName(currentUser.full_name);
            setSelfAvatarId(currentUser.avatar_id || '1');
        }
    }, [currentUser]);

    const handleSelfAccountUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUser) return;
        const payload: any = { username: selfUsername, full_name: selfFullName, avatar_id: selfAvatarId };
        if (selfPassword) {
            if (selfPassword !== selfConfirmPassword) {
                showToast('Passwords do not match', 'warning');
                return;
            }
            payload.password = selfPassword;
        }
        try {
            const res = await fetch(`${API_BASE}/users/${currentUser.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
                },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                const updatedUser = await res.json();
                setCurrentUser(updatedUser);
                showToast('Account updated successfully', 'success');
                setSelfPassword('');
                setSelfConfirmPassword('');
            } else {
                const err = await res.json();
                showToast(`Failed: ${err.detail}`, 'danger');
            }
        } catch (error) {
            showToast('Error updating account', 'danger');
        }
    };

    return (
        <div style={classic ? xpBevel : undefined} className={classic ? '' : 'card shadow-sm border-0 mb-4'}>
            {classic ? (
                <div style={xpTitleBar('linear-gradient(to right, #006e8e 0%, #00a8c8 100%)', '#004a5e')}>
                    <span><i className="bi bi-person-fill" style={{ marginRight: 6 }}></i>Account Settings</span>
                </div>
            ) : (
                <div className="card-header bg-white">
                    <h5 className="card-title mb-0">Account Settings</h5>
                </div>
            )}
            <div style={classic ? { padding: '12px 14px', background: '#ece9d8' } : undefined} className={classic ? '' : 'card-body'}>
                <form onSubmit={handleSelfAccountUpdate}>
                    <div style={classic ? { display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 } : { display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                            <div style={classic ? { width: 56, height: 56, border: '2px solid', borderColor: '#fff #888 #888 #fff', background: '#e0dcd4', display: 'flex', alignItems: 'center', justifyContent: 'center' } : { width: 60, height: 60, border: '2px solid #dee2e6', borderRadius: 8, background: '#f8f9fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <PixelAvatar avatarId={selfAvatarId} size={48} />
                            </div>
                            <span style={classic ? { fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 9, color: '#555' } : { fontSize: 10, color: '#888' }}>Preview</span>
                        </div>
                        <div>
                            <label style={classic ? xpLabel() : { fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 4, display: 'block' }}>Choose Avatar</label>
                            <AvatarPicker value={selfAvatarId} onChange={setSelfAvatarId} classic={classic} />
                        </div>
                    </div>
                    <div className="row">
                        <div className="col-md-6 mb-3">
                            <label style={classic ? xpLabel() : undefined} className={classic ? '' : 'form-label'}>Username</label>
                            <input
                                style={classic ? xpInput({ width: '100%' }) : undefined}
                                className={classic ? '' : 'form-control'}
                                value={selfUsername}
                                onChange={e => setSelfUsername(e.target.value)}
                                required
                            />
                        </div>
                        <div className="col-md-6 mb-3">
                            <label style={classic ? xpLabel() : undefined} className={classic ? '' : 'form-label'}>Full Name</label>
                            <input
                                style={classic ? xpInput({ width: '100%' }) : undefined}
                                className={classic ? '' : 'form-control'}
                                value={selfFullName}
                                onChange={e => setSelfFullName(e.target.value)}
                                required
                            />
                        </div>
                        <div className="col-md-6 mb-3">
                            <label
                                style={classic ? { ...xpLabel(), color: '#8b0000' } : undefined}
                                className={classic ? '' : 'form-label text-danger'}
                            >New Password <span style={classic ? { color: '#666', fontWeight: 'normal' } : undefined}>(leave blank to keep current)</span></label>
                            <input
                                type="password"
                                style={classic ? xpInput({ width: '100%', borderColor: '#cc6666' }) : undefined}
                                className={classic ? '' : 'form-control border-danger border-opacity-25'}
                                value={selfPassword}
                                onChange={e => setSelfPassword(e.target.value)}
                                placeholder="••••••••"
                            />
                        </div>
                        <div className="col-md-6 mb-3">
                            <label
                                style={classic ? { ...xpLabel(), color: '#8b0000' } : undefined}
                                className={classic ? '' : 'form-label text-danger'}
                            >Confirm New Password</label>
                            <input
                                type="password"
                                style={classic ? xpInput({ width: '100%', borderColor: '#cc6666' }) : undefined}
                                className={classic ? '' : 'form-control border-danger border-opacity-25'}
                                value={selfConfirmPassword}
                                onChange={e => setSelfConfirmPassword(e.target.value)}
                                placeholder="••••••••"
                            />
                        </div>
                    </div>
                    <button
                        type="submit"
                        style={classic ? xpBtn({ background: 'linear-gradient(to bottom, #006e8e, #004a5e)', borderColor: '#004a5e #001a2e #001a2e #004a5e', color: '#ffffff', fontWeight: 'bold', width: '100%', padding: '4px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }) : undefined}
                        className={classic ? '' : 'btn btn-outline-primary w-100 mt-2'}
                    >Update My Profile &amp; Security</button>
                </form>
            </div>
        </div>
    );
}
