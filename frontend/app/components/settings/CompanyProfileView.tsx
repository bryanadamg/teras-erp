import { useState, useEffect } from 'react';
import { useToast } from '../shared/Toast';
import { useTheme } from '../../context/ThemeContext';
import { STATIC_BASE as API_BASE } from '../shared/apiBase';
import { xpBtn, xpInput, FieldLabel } from '../shared/xpTheme';
import { settingsActions, settingsGrid, settingsHint, SETTINGS_FIELD_GAP } from './settingsStyles';
import SettingsPanel from './SettingsPanel';

export default function CompanyProfileView({ profile, onUpdate, onUploadLogo, authFetch }: any) {
    const { showToast } = useToast();
    const [editProfile, setEditProfile] = useState({
        name: '',
        address: '',
        phone: '',
        email: '',
        website: '',
        tax_id: ''
    });
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    const { uiStyle: currentStyle } = useTheme();
    const classic = currentStyle === 'classic';

    useEffect(() => {
        if (profile) {
            setEditProfile({
                name: profile.name || '',
                address: profile.address || '',
                phone: profile.phone || '',
                email: profile.email || '',
                website: profile.website || '',
                tax_id: profile.tax_id || ''
            });
        }
    }, [profile]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await onUpdate(editProfile);
            showToast('Company profile updated!', 'success');
        } catch (e) {
            showToast('Failed to update profile', 'danger');
        } finally {
            setIsSaving(false);
        }
    };

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.[0]) return;
        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', e.target.files[0]);
            await onUploadLogo(formData);
            showToast('Logo uploaded successfully!', 'success');
        } catch (e) {
            showToast('Failed to upload logo', 'danger');
        } finally {
            setIsUploading(false);
        }
    };

    const inputStyle = classic ? xpInput({ width: '100%' }) : undefined;
    const inputClass = classic ? '' : 'form-control form-control-sm';

    return (
        <SettingsPanel
            classic={classic}
            icon="bi-building"
            title="Company Profile"
            right="Used on printed document headers"
        >
            <form onSubmit={handleSubmit}>
                {/* Logo is one decision and the address block is another, so they
                    sit side by side and wrap as a unit — not as a bootstrap
                    column with a border hung off its edge. */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
                    <div style={{ width: 200, flexShrink: 0 }}>
                        <FieldLabel classic={classic}>Company Logo</FieldLabel>
                        <div style={{
                            border: classic ? '1px solid #7f9db9' : '1px solid #dbe1ea',
                            borderRadius: classic ? 0 : 4,
                            background: '#ffffff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            height: 132, marginBottom: 6, padding: 8,
                        }}>
                            {profile?.logo_url ? (
                                <img src={`${API_BASE}${profile.logo_url}`} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                            ) : (
                                <span style={settingsHint(classic)}>No logo uploaded</span>
                            )}
                        </div>
                        <label
                            style={classic ? xpBtn({ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }) : { cursor: 'pointer', width: '100%' }}
                            className={classic ? '' : 'btn btn-sm btn-outline-secondary'}
                        >
                            {isUploading ? <span className="spinner-border spinner-border-sm"></span> : <i className="bi bi-upload"></i>}
                            <span style={{ marginLeft: 4 }}>Upload Logo</span>
                            <input type="file" hidden onChange={handleLogoUpload} disabled={isUploading} accept="image/*" />
                        </label>
                        <div style={settingsHint(classic)}>Transparent PNG, around 300 × 100 px.</div>
                    </div>

                    <div style={{ flex: '1 1 340px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: SETTINGS_FIELD_GAP }}>
                        <div>
                            <FieldLabel classic={classic}>Company Name</FieldLabel>
                            <input style={inputStyle} className={inputClass} value={editProfile.name} onChange={e => setEditProfile({ ...editProfile, name: e.target.value })} required />
                        </div>
                        <div>
                            <FieldLabel classic={classic}>Address</FieldLabel>
                            <textarea
                                style={classic ? xpInput({ width: '100%', height: 'auto', padding: '4px 6px', resize: 'vertical' as const }) : undefined}
                                className={inputClass}
                                rows={2}
                                value={editProfile.address}
                                onChange={e => setEditProfile({ ...editProfile, address: e.target.value })}
                            />
                        </div>
                        <div style={settingsGrid(160)}>
                            <div>
                                <FieldLabel classic={classic}>Phone</FieldLabel>
                                <input style={inputStyle} className={inputClass} value={editProfile.phone} onChange={e => setEditProfile({ ...editProfile, phone: e.target.value })} />
                            </div>
                            <div>
                                <FieldLabel classic={classic}>Email</FieldLabel>
                                <input type="email" style={inputStyle} className={inputClass} value={editProfile.email} onChange={e => setEditProfile({ ...editProfile, email: e.target.value })} />
                            </div>
                            <div>
                                <FieldLabel classic={classic}>Website</FieldLabel>
                                <input style={inputStyle} className={inputClass} value={editProfile.website} onChange={e => setEditProfile({ ...editProfile, website: e.target.value })} />
                            </div>
                            <div>
                                <FieldLabel classic={classic}>Tax ID / NPWP</FieldLabel>
                                <input style={inputStyle} className={inputClass} value={editProfile.tax_id} onChange={e => setEditProfile({ ...editProfile, tax_id: e.target.value })} />
                            </div>
                        </div>
                    </div>
                </div>

                <div style={settingsActions(classic)}>
                    <button
                        type="submit"
                        style={classic ? xpBtn({
                            background: 'linear-gradient(to bottom, #316ac5, #1a4a8a)',
                            borderColor: '#1a3a7a #0a1a4a #0a1a4a #1a3a7a',
                            color: '#ffffff', fontWeight: 'bold', padding: '3px 14px',
                            display: 'flex', alignItems: 'center', gap: 4,
                        }) : undefined}
                        className={classic ? '' : 'btn btn-sm btn-primary px-3'}
                        disabled={isSaving}
                    >
                        {isSaving ? <span className="spinner-border spinner-border-sm"></span> : <i className="bi bi-save"></i>}
                        <span style={{ marginLeft: 4 }}>Save Profile</span>
                    </button>
                </div>
            </form>
        </SettingsPanel>
    );
}
