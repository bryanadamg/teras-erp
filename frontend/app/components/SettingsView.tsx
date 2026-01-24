import { useState, useEffect } from 'react';
import { useToast } from './Toast';
import { useUser, User } from '../context/UserContext';

export default function SettingsView({ appName, onUpdateAppName, uiStyle, onUpdateUIStyle }: any) {
  const { showToast } = useToast();
  const { currentUser, users, setCurrentUser, hasPermission, refreshUsers } = useUser();
  
  const [name, setName] = useState(appName);
  const [style, setStyle] = useState(uiStyle || 'default');
  const [roles, setRoles] = useState<any[]>([]);
  const [allPermissions, setAllPermissions] = useState<any[]>([]);

  // User Management State
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRoleId, setEditRoleId] = useState('');
  const [editPermissionIds, setEditPermissionIds] = useState<string[]>([]);
  const [newPassword, setNewPassword] = useState('');

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';

  useEffect(() => {
      // Fetch roles and permissions
      Promise.all([
          fetch(`${API_BASE}/roles`).then(res => res.json()),
          fetch(`${API_BASE}/permissions`).then(res => res.json())
      ]).then(([rolesData, permsData]) => {
          setRoles(rolesData);
          setAllPermissions(permsData);
      }).catch(err => console.error("Failed to fetch auth data", err));
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      onUpdateAppName(name);
      onUpdateUIStyle(style);
      showToast('Settings updated successfully!', 'success');
  };

  const startEditingUser = (user: User) => {
      setEditingUser(user.id);
      setEditName(user.full_name);
      setEditRoleId(user.role?.id || '');
      setEditPermissionIds(user.permissions?.map(p => p.id) || []);
      setNewPassword(''); // Reset password field
  };

  const toggleEditPermission = (permId: string) => {
      setEditPermissionIds(prev => 
          prev.includes(permId) ? prev.filter(id => id !== permId) : [...prev, permId]
      );
  };

  const saveUserChanges = async (userId: string) => {
      try {
          const payload: any = { 
              full_name: editName, 
              role_id: editRoleId || null,
              permission_ids: editPermissionIds
          };
          
          if (newPassword) {
              payload.password = newPassword;
          }

          const res = await fetch(`${API_BASE}/users/${userId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          });
          
          if (res.ok) {
              showToast('User updated successfully!', 'success');
              setEditingUser(null);
              setNewPassword('');
              refreshUsers(); // Refresh the global user list
          } else {
              const err = await res.json();
              showToast(`Failed: ${err.detail}`, 'danger');
          }
      } catch (e) {
          console.error(e);
          showToast('Error updating user', 'danger');
      }
  };

  return (
    <div className="row justify-content-center fade-in">
      <div className="col-md-10">
        <div className="card shadow-sm border-0 mb-4">
          <div className="card-header bg-white">
             <h5 className="card-title mb-0">System Settings</h5>
          </div>
          <div className="card-body">
             <form onSubmit={handleSubmit}>
                 <div className="row">
                     <div className="col-md-6 mb-3">
                         <label className="form-label">Application Name</label>
                         <input className="form-control" value={name} onChange={e => setName(e.target.value)} />
                     </div>
                     <div className="col-md-6 mb-3">
                         <label className="form-label">Interface Style</label>
                         <select className="form-select" value={style} onChange={e => setStyle(e.target.value)}>
                             <option value="default">Default (Corporate)</option>
                             <option value="modern">Modern (Rounded)</option>
                             <option value="compact">Compact (High Density)</option>
                             <option value="classic">Classic (Windows XP)</option>
                         </select>
                     </div>
                 </div>
                 <button type="submit" className="btn btn-primary w-100">Save System Preferences</button>
             </form>
          </div>
        </div>

        {/* Admin User Management */}
        {hasPermission('admin.access') && (
            <div className="card shadow-sm border-0">
                <div className="card-header bg-danger bg-opacity-10 text-danger-emphasis">
                    <h5 className="card-title mb-0"><i className="bi bi-shield-lock me-2"></i>User Management (Admin)</h5>
                </div>
                <div className="card-body p-0">
                    <div className="table-responsive">
                        <table className="table table-hover align-middle mb-0">
                            <thead className="table-light">
                                <tr>
                                    <th className="ps-4">Username</th>
                                    <th>Full Name</th>
                                    <th>Role & Password</th>
                                    <th>Custom Tab Access (Granular)</th>
                                    <th className="text-end pe-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(user => (
                                    <tr key={user.id} className={editingUser === user.id ? 'bg-light' : ''}>
                                        <td className="ps-4 font-monospace">{user.username}</td>
                                        
                                        {editingUser === user.id ? (
                                            <>
                                                <td>
                                                    <input 
                                                        className="form-control form-control-sm" 
                                                        value={editName} 
                                                        onChange={e => setEditName(e.target.value)} 
                                                    />
                                                </td>
                                                <td>
                                                    <select 
                                                        className="form-select form-select-sm mb-2"
                                                        value={editRoleId}
                                                        onChange={e => setEditRoleId(e.target.value)}
                                                    >
                                                        <option value="">No Role</option>
                                                        {roles.map(r => (
                                                            <option key={r.id} value={r.id}>{r.name}</option>
                                                        ))}
                                                    </select>
                                                    <input 
                                                        type="password"
                                                        className="form-control form-control-sm"
                                                        placeholder="Reset Password..."
                                                        value={newPassword}
                                                        onChange={e => setNewPassword(e.target.value)}
                                                    />
                                                </td>
                                                <td>
                                                    <div className="d-flex flex-wrap gap-2 p-2 border rounded bg-white" style={{maxHeight: '150px', overflowY: 'auto'}}>
                                                        {allPermissions.map(p => (
                                                            <div key={p.id} className="form-check m-0">
                                                                <input 
                                                                    className="form-check-input" 
                                                                    type="checkbox" 
                                                                    checked={editPermissionIds.includes(p.id)}
                                                                    onChange={() => toggleEditPermission(p.id)}
                                                                    id={`perm-${p.id}`}
                                                                />
                                                                <label className="form-check-label small" htmlFor={`perm-${p.id}`} title={p.description}>
                                                                    {p.code}
                                                                </label>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="text-end pe-4">
                                                    <div className="d-flex gap-1 justify-content-end">
                                                        <button className="btn btn-sm btn-success" onClick={() => saveUserChanges(user.id)}>
                                                            <i className="bi bi-check-lg"></i>
                                                        </button>
                                                        <button className="btn btn-sm btn-light border" onClick={() => setEditingUser(null)}>
                                                            <i className="bi bi-x-lg"></i>
                                                        </button>
                                                    </div>
                                                </td>
                                            </>
                                        ) : (
                                            <>
                                                <td>{user.full_name}</td>
                                                <td><span className="badge bg-secondary">{user.role?.name || '-'}</span></td>
                                                <td>
                                                    <div className="d-flex flex-wrap gap-1">
                                                        {user.permissions?.map(p => (
                                                            <span key={p.id} className="badge bg-info bg-opacity-10 text-info border border-info border-opacity-25" style={{fontSize: '0.65rem'}}>
                                                                {p.code}
                                                            </span>
                                                        ))}
                                                        {(!user.permissions || user.permissions.length === 0) && <span className="text-muted small italic">Inherited only</span>}
                                                    </div>
                                                </td>
                                                <td className="text-end pe-4">
                                                    <button className="btn btn-sm btn-link" onClick={() => startEditingUser(user)}>
                                                        <i className="bi bi-pencil-square"></i>
                                                    </button>
                                                </td>
                                            </>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}

      </div>
    </div>
  );
}