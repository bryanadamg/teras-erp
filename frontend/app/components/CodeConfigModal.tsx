'use client';

import React, { useState } from 'react';
import ModalWrapper from './ModalWrapper';

export interface CodeConfig {
    prefix: string;
    suffix: string;
    separator: string;
    includeItemCode: boolean;
    includeVariant: boolean;
    variantAttributeNames: string[];
    includeYear: boolean;
    includeMonth: boolean;
}

interface CodeConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (config: CodeConfig) => void;
    initialConfig: CodeConfig;
    type: string;
    attributes?: any[];
}

export default function CodeConfigModal({ isOpen, onClose, onSave, initialConfig, type, attributes = [] }: CodeConfigModalProps) {
    const [config, setConfig] = useState<CodeConfig>(initialConfig);

    const handleSave = () => {
        onSave(config);
        onClose();
    };

    return (
        <ModalWrapper
            isOpen={isOpen}
            onClose={onClose}
            title={<><i className="bi bi-gear-fill me-1"></i> {type} ID Generation Pattern</>}
            level={2} // Sub-modal level
            variant="dark"
            footer={
                <>
                    <button className="btn btn-sm btn-link text-muted text-decoration-none" onClick={onClose}>Cancel</button>
                    <button className="btn btn-sm btn-primary px-4 fw-bold" onClick={handleSave}>Save Pattern</button>
                </>
            }
        >
            <div className="row g-3">
                <div className="col-md-6">
                    <label className="form-label extra-small fw-bold text-muted uppercase">Prefix</label>
                    <input className="form-control form-control-sm" value={config.prefix} onChange={e => setConfig({...config, prefix: e.target.value})} placeholder="e.g. ITEM" />
                </div>
                <div className="col-md-6">
                    <label className="form-label extra-small fw-bold text-muted uppercase">Separator</label>
                    <input className="form-control form-control-sm" value={config.separator} onChange={e => setConfig({...config, separator: e.target.value})} placeholder="e.g. -" />
                </div>
                
                <div className="col-12 mt-3">
                    <h6 className="extra-small fw-bold text-muted border-bottom pb-2 mb-3 uppercase">Dynamic Components</h6>
                    <div className="d-flex flex-column gap-2">
                        <div className="form-check form-switch">
                            <input className="form-check-input" type="checkbox" checked={config.includeYear} onChange={e => setConfig({...config, includeYear: e.target.checked})} />
                            <label className="form-check-label small">Include Current Year</label>
                        </div>
                        <div className="form-check form-switch">
                            <input className="form-check-input" type="checkbox" checked={config.includeMonth} onChange={e => setConfig({...config, includeMonth: e.target.checked})} />
                            <label className="form-check-label small">Include Current Month</label>
                        </div>
                        {type === 'WO' && (
                            <>
                                <div className="form-check form-switch">
                                    <input className="form-check-input" type="checkbox" checked={config.includeItemCode} onChange={e => setConfig({...config, includeItemCode: e.target.checked})} />
                                    <label className="form-check-label small">Include Product Item Code</label>
                                </div>
                                <div className="form-check form-switch">
                                    <input className="form-check-input" type="checkbox" checked={config.includeVariant} onChange={e => setConfig({...config, includeVariant: e.target.checked})} />
                                    <label className="form-check-label small">Include Variant Values</label>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </ModalWrapper>
    );
}
