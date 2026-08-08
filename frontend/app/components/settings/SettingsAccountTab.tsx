'use client';

import { useState, useEffect } from 'react';
import { useToast } from '../shared/Toast';
import { useTheme } from '../../context/ThemeContext';
import { useUser } from '../../context/UserContext';
import { xpBtn, xpInput, FieldLabel } from '../shared/xpTheme';
import { settingsActions, settingsGrid, settingsHint, settingsStack } from './settingsStyles';
import SettingsPanel from './SettingsPanel';
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
        // Identity and password are two decisions, not four fields in one 2x2
        // block — changing your display name shouldn't sit in the same rhythm as
        // resetting your own credentials. One form still submits both.
        <form onSubmit={handleSelfAccountUpdate} style={settingsStack}>
            <SettingsPanel classic={classic} icon="bi-person-fill" title="Profile">
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        <div style={classic ? {
                            width: 56, height: 56, border: '2px solid', borderColor: '#fff #888 #888 #fff',
                            background: '#e0dcd4', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        } : {
                            width: 60, height: 60, border: '1px solid #dee2e6', borderRadius: 8,
                            background: '#f8f9fa', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <PixelAvatar avatarId={selfAvatarId} size={48} />
                        </div>
                        <span style={settingsHint(classic)}>Preview</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <FieldLabel classic={classic}>Choose Avatar</FieldLabel>
                        <AvatarPicker value={selfAvatarId} onChange={setSelfAvatarId} classic={classic} />
                    </div>
                </div>
                <div style={settingsGrid()}>
                    <div>
                        <FieldLabel classic={classic}>Username</FieldLabel>
                        <input
                            style={classic ? xpInput({ width: '100%' }) : undefined}
                            className={classic ? '' : 'form-control form-control-sm'}
                            value={selfUsername}
                            onChange={e => setSelfUsername(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <FieldLabel classic={classic}>Full Name</FieldLabel>
                        <input
                            style={classic ? xpInput({ width: '100%' }) : undefined}
                            className={classic ? '' : 'form-control form-control-sm'}
                            value={selfFullName}
                            onChange={e => setSelfFullName(e.target.value)}
                            required
                        />
                    </div>
                </div>
            </SettingsPanel>

            <SettingsPanel classic={classic} icon="bi-key-fill" title="Password">
                <div style={settingsGrid()}>
                    <div>
                        <FieldLabel classic={classic} hint="Leave blank to keep your current password.">New Password</FieldLabel>
                        <input
                            type="password"
                            style={classic ? xpInput({ width: '100%' }) : undefined}
                            className={classic ? '' : 'form-control form-control-sm'}
                            value={selfPassword}
                            onChange={e => setSelfPassword(e.target.value)}
                            placeholder="••••••••"
                        />
                    </div>
                    <div>
                        <FieldLabel classic={classic}>Confirm New Password</FieldLabel>
                        <input
                            type="password"
                            style={classic ? xpInput({ width: '100%' }) : undefined}
                            className={classic ? '' : 'form-control form-control-sm'}
                            value={selfConfirmPassword}
                            onChange={e => setSelfConfirmPassword(e.target.value)}
                            placeholder="••••••••"
                        />
                    </div>
                </div>
            </SettingsPanel>

            {/* One submit for both groups, so it sits under both — not inside
                the password group where it would read as "save password". */}
            <div style={{ ...settingsActions(classic), marginTop: 0 }}>
                <button
                    type="submit"
                    style={classic ? xpBtn({
                        background: 'linear-gradient(to bottom, #316ac5, #1a4a8a)',
                        borderColor: '#1a3a7a #0a1a4a #0a1a4a #1a3a7a',
                        color: '#ffffff', fontWeight: 'bold', padding: '3px 14px',
                    }) : undefined}
                    className={classic ? '' : 'btn btn-sm btn-primary px-3'}
                >Save Account</button>
            </div>
        </form>
    );
}
