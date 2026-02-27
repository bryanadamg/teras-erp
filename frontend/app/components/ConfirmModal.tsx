interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export default function ConfirmModal({ isOpen, title, message, onConfirm, onCancel }: ConfirmModalProps) {
    if (!isOpen) return null;

    return (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10200, position: 'fixed', inset: 0 }}>
            <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content shadow">
                    <div className="modal-header bg-danger bg-opacity-10 text-danger-emphasis">
                        <h5 className="modal-title"><i className="bi bi-exclamation-triangle-fill me-2"></i>{title}</h5>
                        <button type="button" className="btn-close" onClick={onCancel}></button>
                    </div>
                    <div className="modal-body">
                        <p className="mb-0">{message}</p>
                    </div>
                    <div className="modal-footer bg-light">
                        <button type="button" className="btn btn-sm btn-secondary" onClick={onCancel}>Cancel</button>
                        <button type="button" className="btn btn-sm btn-danger fw-bold px-4" onClick={onConfirm}>Delete</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
