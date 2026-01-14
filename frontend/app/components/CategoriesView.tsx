import { useState } from 'react';

export default function CategoriesView({ categories, onCreateCategory, onDeleteCategory }: any) {
  const [newCategoryName, setNewCategoryName] = useState('');

  const handleCreateCategory = (e: React.FormEvent) => {
      e.preventDefault();
      if (newCategoryName) {
          onCreateCategory(newCategoryName);
          setNewCategoryName('');
      }
  };

  return (
    <div className="row justify-content-center fade-in">
        <div className="col-md-8">
            <div className="card h-100">
                <div className="card-header bg-white">
                    <h5 className="card-title mb-0">Item Categories</h5>
                    <p className="text-muted small mb-0 mt-1">Classify your inventory items for better organization and filtering.</p>
                </div>
                <div className="card-body">
                    <form onSubmit={handleCreateCategory} className="mb-4 p-4 bg-light rounded-3 border border-dashed">
                        <label className="form-label fw-bold">New Category Name</label>
                        <div className="input-group">
                            <input className="form-control" placeholder="e.g. Spare Parts, Raw Materials..." value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} required />
                            <button type="submit" className="btn btn-success px-4">Add Category</button>
                        </div>
                    </form>

                    <h6 className="text-uppercase text-muted small fw-bold mb-3">Existing Categories</h6>
                    <div className="list-group list-group-flush border rounded">
                        {categories && categories.map((cat: any) => (
                            <div key={cat.id} className="list-group-item d-flex justify-content-between align-items-center">
                                <span className="fw-medium">{cat.name}</span>
                                <button className="btn btn-sm text-danger hover-bg-danger-light" onClick={() => onDeleteCategory(cat.id)}>
                                    <i className="bi bi-trash me-1"></i> Delete
                                </button>
                            </div>
                        ))}
                        {categories && categories.length === 0 && (
                            <div className="list-group-item text-center text-muted py-4 fst-italic">No categories defined</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
}
