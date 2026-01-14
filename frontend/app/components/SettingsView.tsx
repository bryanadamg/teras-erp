import { useState } from 'react';
import { useToast } from './Toast';

export default function SettingsView({ appName, onUpdateAppName, uiStyle, onUpdateUIStyle }: any) {
  const { showToast } = useToast();
  const [name, setName] = useState(appName);
  const [style, setStyle] = useState(uiStyle || 'default');

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      onUpdateAppName(name);
      onUpdateUIStyle(style);
      showToast('Settings updated successfully!', 'success');
  };

  return (
    <div className="row justify-content-center fade-in">
      <div className="col-md-6">
        <div className="card">
          <div className="card-header bg-white">
             <h5 className="card-title mb-0">System Settings</h5>
          </div>
          <div className="card-body">
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
