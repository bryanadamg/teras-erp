import { useState } from 'react';

export default function SettingsView({ appName, onUpdateAppName }: any) {
  const [name, setName] = useState(appName);

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      onUpdateAppName(name);
      alert('Application name updated!');
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
                 <button type="submit" className="btn btn-primary">Save Changes</button>
             </form>
          </div>
        </div>
      </div>
    </div>
  );
}
