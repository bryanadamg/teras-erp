import { useState } from 'react';
import { useToast } from './Toast';
import { useUser } from '../context/UserContext';

export default function SettingsView({ appName, onUpdateAppName, uiStyle, onUpdateUIStyle }: any) {
  const { showToast } = useToast();
  const { currentUser, users, setCurrentUser } = useUser();
  
  const [name, setName] = useState(appName);
  const [style, setStyle] = useState(uiStyle || 'default');

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

  return (
    <div className="row justify-content-center fade-in">
      <div className="col-md-6">
        <div className="card">
          <div className="card-header bg-white">
             <h5 className="card-title mb-0">System Settings</h5>
          </div>
          <div className="card-body">
             
             {/* User / Role Switcher (Simulation) */}
             <div className="mb-4 p-3 bg-light rounded border">
                 <label className="form-label fw-bold small text-uppercase text-muted">Current User (Role Switching)</label>
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
                     <strong>Permissions:</strong> {currentUser?.role?.permissions.map(p => p.code).join(', ') || 'None'}
                 </div>
             </div>

             <hr className="my-4"/>

             <form onSubmit={handleSubmit}>
                 <div className="mb-3">
                     <label className="form-label">Application Name</label>
                     <input className="form-control" value={name} onChange={e => setName(e.target.value)} />
                     <div className="form-text">This name will appear in the sidebar and browser title.</div>
                 </div>
                 
                 <div className="mb-4">
                     <label className="form-label">Interface Style</label>
                     <select className="form-select" value={style} onChange={e => setStyle(e.target.value)}>
                         <option value="default">Default (Corporate)</option>
                         <option value="modern">Modern (Rounded)</option>
                         <option value="compact">Compact (High Density)</option>
                         <option value="classic">Classic (Windows XP)</option>
                     </select>
                     <div className="form-text">Choose the appearance that best fits your workflow.</div>
                 </div>

                 <button type="submit" className="btn btn-primary w-100">Save Changes</button>
             </form>
          </div>
        </div>
      </div>
    </div>
  );
}
