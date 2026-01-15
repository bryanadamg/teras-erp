import { useState } from 'react';

export default function RoutingView({ workCenters, operations, onCreateWorkCenter, onDeleteWorkCenter, onCreateOperation, onDeleteOperation, onRefresh }: any) {
  const [newWorkCenter, setNewWorkCenter] = useState({ code: '', name: '', cost_per_hour: 0 });
  const [newOperation, setNewOperation] = useState({ code: '', name: '' });

  const handleCreateWC = (e: React.FormEvent) => {
      e.preventDefault();
      onCreateWorkCenter(newWorkCenter);
      setNewWorkCenter({ code: '', name: '', cost_per_hour: 0 });
  };

  const handleCreateOp = (e: React.FormEvent) => {
      e.preventDefault();
      onCreateOperation(newOperation);
      setNewOperation({ code: '', name: '' });
  };

  return (
    <div className="row g-4 fade-in">
        
        {/* Work Centers (Stations) */}
        <div className="col-md-6">
            <div className="card h-100">
                <div className="card-header bg-white d-flex justify-content-between align-items-center">
                    <div>
                        <h5 className="card-title mb-0">Work Centers</h5>
                        <p className="text-muted small mb-0 mt-1">Define factory stations and machines.</p>
                    </div>
                    <button className="btn btn-sm btn-outline-secondary" onClick={onRefresh}><i className="bi bi-arrow-clockwise"></i></button>
                </div>
                <div className="card-body">
                    <form onSubmit={handleCreateWC} className="mb-4 p-3 bg-light rounded border border-dashed">
                        <div className="row g-2 align-items-end">
                            <div className="col-3">
                                <label className="form-label small">Code</label>
                                <input className="form-control form-control-sm" placeholder="WC-01" value={newWorkCenter.code} onChange={e => setNewWorkCenter({...newWorkCenter, code: e.target.value})} required />
                            </div>
                            <div className="col-5">
                                <label className="form-label small">Name</label>
                                <input className="form-control form-control-sm" placeholder="Assembly Line 1" value={newWorkCenter.name} onChange={e => setNewWorkCenter({...newWorkCenter, name: e.target.value})} required />
                            </div>
                            <div className="col-4">
                                <button type="submit" className="btn btn-sm btn-primary w-100">Add Station</button>
                            </div>
                        </div>
                    </form>

                    <div className="table-responsive">
                        <table className="table table-hover align-middle mb-0">
                            <thead className="table-light">
                                <tr>
                                    <th>Code</th>
                                    <th>Station Name</th>
                                    <th style={{width: '50px'}}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {workCenters.map((wc: any) => (
                                    <tr key={wc.id}>
                                        <td className="fw-bold font-monospace text-primary small">{wc.code}</td>
                                        <td>{wc.name}</td>
                                        <td>
                                            <button className="btn btn-sm text-danger" onClick={() => onDeleteWorkCenter(wc.id)}>
                                                <i className="bi bi-trash"></i>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {workCenters.length === 0 && <tr><td colSpan={3} className="text-center py-3 text-muted small">No work centers defined</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        {/* Operations (Steps) */}
        <div className="col-md-6">
            <div className="card h-100">
                <div className="card-header bg-white">
                    <h5 className="card-title mb-0">Standard Operations</h5>
                    <p className="text-muted small mb-0 mt-1">Define reusable process steps like "Cutting", "Welding".</p>
                </div>
                <div className="card-body">
                    <form onSubmit={handleCreateOp} className="mb-4 p-3 bg-light rounded border border-dashed">
                        <div className="row g-2 align-items-end">
                            <div className="col-3">
                                <label className="form-label small">Code</label>
                                <input className="form-control form-control-sm" placeholder="OP-10" value={newOperation.code} onChange={e => setNewOperation({...newOperation, code: e.target.value})} required />
                            </div>
                            <div className="col-5">
                                <label className="form-label small">Name</label>
                                <input className="form-control form-control-sm" placeholder="Cutting" value={newOperation.name} onChange={e => setNewOperation({...newOperation, name: e.target.value})} required />
                            </div>
                            <div className="col-4">
                                <button type="submit" className="btn btn-sm btn-success w-100">Add Operation</button>
                            </div>
                        </div>
                    </form>

                    <div className="table-responsive">
                        <table className="table table-hover align-middle mb-0">
                            <thead className="table-light">
                                <tr>
                                    <th>Code</th>
                                    <th>Operation Name</th>
                                    <th style={{width: '50px'}}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {operations.map((op: any) => (
                                    <tr key={op.id}>
                                        <td className="fw-bold font-monospace text-success small">{op.code}</td>
                                        <td>{op.name}</td>
                                        <td>
                                            <button className="btn btn-sm text-danger" onClick={() => onDeleteOperation(op.id)}>
                                                <i className="bi bi-trash"></i>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {operations.length === 0 && <tr><td colSpan={3} className="text-center py-3 text-muted small">No operations defined</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

    </div>
  );
}
