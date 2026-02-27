import { useState, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';

interface BulkImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (file: File) => Promise<any>;
    onDownloadTemplate: () => void;
    title: string;
}

export default function BulkImportModal({ isOpen, onClose, onImport, onDownloadTemplate, title }: BulkImportModalProps) {
    const { t } = useLanguage();
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [results, setResults] = useState<any>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [currentStyle, setCurrentStyle] = useState('default');
    useState(() => {
        const savedStyle = localStorage.getItem('ui_style');
        if (savedStyle) setCurrentStyle(savedStyle);
    });

    if (!isOpen) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setResults(null);
        }
    };

    const handleUpload = async () => {
        if (!file) return;
        setUploading(true);
        try {
            const res = await onImport(file);
            setResults(res);
        } catch (error) {
            setResults({ status: 'error', errors: ['Upload failed'] });
        } finally {
            setUploading(false);
        }
    };

    const reset = () => {
        setFile(null);
        setResults(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10100, position: 'fixed', inset: 0 }}>
            <div className={`modal-dialog modal-dialog-centered ui-style-${currentStyle}`}>
                <div className="modal-content shadow">
                    <div className="modal-header bg-light">
                        <h5 className="modal-title"><i className="bi bi-file-earmark-spreadsheet me-2"></i>{title}</h5>
                        <button type="button" className="btn-close" onClick={onClose}></button>
                    </div>
                    <div className="modal-body">
                        {!results ? (
                            <>
                                <p className="text-muted small">
                                    Upload a CSV file to bulk create items. Please use the provided template to ensure correct formatting.
                                </p>
                                <div className="d-flex justify-content-between mb-4">
                                    <button className="btn btn-sm btn-outline-primary" onClick={onDownloadTemplate}>
                                        <i className="bi bi-download me-1"></i>Download Template
                                    </button>
                                </div>
                                <div className="mb-3">
                                    <label className="form-label small fw-bold">Select File</label>
                                    <input 
                                        type="file" 
                                        className="form-control" 
                                        accept=".csv" 
                                        onChange={handleFileChange}
                                        ref={fileInputRef}
                                    />
                                </div>
                            </>
                        ) : (
                            <div className="text-center">
                                {results.status === 'success' ? (
                                    <div className="text-success mb-3">
                                        <i className="bi bi-check-circle-fill fs-1"></i>
                                        <h5 className="mt-2">Import Successful!</h5>
                                        <p>{results.imported} items imported.</p>
                                    </div>
                                ) : (
                                    <div className="text-start">
                                        <div className="d-flex align-items-center text-warning mb-2">
                                            <i className="bi bi-exclamation-triangle-fill fs-4 me-2"></i>
                                            <h5 className="mb-0">Partial Success</h5>
                                        </div>
                                        <p className="small text-muted">Imported: {results.imported}</p>
                                        <div className="alert alert-warning small" style={{maxHeight: '150px', overflowY: 'auto'}}>
                                            <ul className="mb-0 ps-3">
                                                {results.errors.map((err: string, i: number) => (
                                                    <li key={i}>{err}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="modal-footer bg-light">
                        {results ? (
                            <button className="btn btn-primary" onClick={() => { reset(); onClose(); }}>Close</button>
                        ) : (
                            <>
                                <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                                <button 
                                    className="btn btn-success" 
                                    onClick={handleUpload} 
                                    disabled={!file || uploading}
                                >
                                    {uploading ? 'Importing...' : 'Start Import'}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
