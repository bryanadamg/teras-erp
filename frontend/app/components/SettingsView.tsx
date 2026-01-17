import { useState, useEffect } from 'react';
import { useToast } from './Toast';
import { useUser, User } from '../context/UserContext';

export default function SettingsView({ appName, onUpdateAppName, uiStyle, onUpdateUIStyle }: any) {
  const { showToast } = useToast();
  const { currentUser, users, setCurrentUser, hasPermission, refreshUsers } = useUser();
  
  const [name, setName] = useState(appName);
  const [style, setStyle] = useState(uiStyle || 'default');
  const [roles, setRoles] = useState<any[]>([]);

  // User Management State
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRoleId, setEditRoleId] = useState('');

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';

  useEffect(() => {
      // Fetch roles for the dropdown
      fetch(`${API_BASE}/roles`)
          .then(res => res.json())
          .then(data => setRoles(data))
          .catch(err => console.error("Failed to fetch roles", err));
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      onUpdateAppName(name);
      onUpdateUIStyle(style);
      showToast('Settings updated successfully!', 'success');
  };

  const handleUserSwitch = (userId: string) => {
      const selected = users.find(u => u.id === userId);
      if (selected) {
          setCurrentUser(selected);
          showToast(`Switched to user: ${selected.username} (${selected.role.name})`, 'info');
      }
  };

  const startEditingUser = (user: User) => {
      setEditingUser(user.id);
      setEditName(user.full_name);
      setEditRoleId(user.role.id);
  };

  const saveUserChanges = async (userId: string) => {
      try {
          const res = await fetch(`${API_BASE}/users/${userId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ full_name: editName, role_id: editRoleId })
          });
          
          if (res.ok) {
              showToast('User updated successfully!', 'success');
              setEditingUser(null);
              refreshUsers(); // Refresh the global user list
          } else {
              showToast('Failed to update user', 'danger');
          }
      } catch (e) {
          console.error(e);
          showToast('Error updating user', 'danger');
      }
  };

  return (
    <div className="row justify-content-center fade-in">
      <div className="col-md-8">
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

        {/* User / Role Switcher (Simulation) */}
        <div className="card shadow-sm border-0 mb-4 bg-light">
            <div className="card-body">
                 <label className="form-label fw-bold small text-uppercase text-muted">Current Session (Role Switching)</label>
                 <select 
                    className="form-select" 
                    value={currentUser?.id || ''} 
                    onChange={(e) => handleUserSwitch(e.target.value)}
                 >
                     {users.map(u => (
                         <option key={u.id} value={u.id}>
                             {u.full_name} — {u.role?.name || 'No Role'}
                         </option>
                     ))}
                 </select>
                 <div className="form-text small mt-2">
                     <strong>Active Permissions:</strong> {currentUser?.role?.permissions.map(p => p.code).join(', ') || 'None'}
                 </div>
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
                                    <th>Role / Access Level</th>
                                    <th className="text-end pe-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(user => (
                                    <tr key={user.id}>
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
                                                        className="form-select form-select-sm"
                                                        value={editRoleId}
                                                        onChange={e => setEditRoleId(e.target.value)}
                                                    >
                                                        {roles.map(r => (
                                                            <option key={r.id} value={r.id}>{r.name}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td className="text-end pe-4">
                                                    <button className="btn btn-sm btn-success me-1" onClick={() => saveUserChanges(user.id)}>
                                                        <i className="bi bi-check-lg"></i>
                                                    </button>
                                                    <button className="btn btn-sm btn-light border" onClick={() => setEditingUser(null)}>
                                                        <i className="bi bi-x-lg"></i>
                                                    </button>
                                                </td>
                                            </>
                                        ) : (
                                            <>
                                                <td>{user.full_name}</td>
                                                <td><span className="badge bg-secondary">{user.role?.name}</span></td>
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