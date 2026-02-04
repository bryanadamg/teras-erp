import { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import CodeConfigModal, { CodeConfig } from './CodeConfigModal';
import BOMAutomatorModal from './BOMAutomatorModal';

// Types for Recursive Structure
interface BOMLineNode {
    id: string; // Temp ID for UI
    item_code: string;
    attribute_value_ids: string[];
    qty: number;
    source_location_code: string;
    subBOM?: BOMNodeData; // The nested BOM definition
    isExpanded?: boolean;
}

interface BOMNodeData {
    code: string;
    item_code: string; // The parent item
    attribute_value_ids: string[];
    qty: number;
    operations: any[];
    lines: BOMLineNode[];
}

export default function BOMDesigner({ 
    rootItemCode, 
    items, 
    locations, 
    attributes, 
    workCenters, 
    operations, 
    onSave, 
    onCancel,
    existingBOMs 
}: any) {
    const { t } = useLanguage();
    
    // Initial Root State
    const [rootBOM, setRootBOM] = useState<BOMNodeData>({
        code: '',
        item_code: rootItemCode || '',
        attribute_value_ids: [],
        qty: 1.0,
        operations: [],
        lines: []
    });

    // Modal States
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const [isAutomatorOpen, setIsAutomatorOpen] = useState(false);
    
    const [codeConfig, setCodeConfig] = useState<CodeConfig>({
        prefix: 'BOM',
        suffix: '',
        separator: '-',
        includeItemCode: true,
        includeVariant: false,
        variantAttributeNames: [],
        includeYear: false,
        includeMonth: false
    });

    // Load config on mount
    useEffect(() => {
        const savedConfig = localStorage.getItem('bom_code_config');
        if (savedConfig) {
            try {
                setCodeConfig(JSON.parse(savedConfig));
            } catch (e) {
                console.error("Invalid config");
            }
        }
    }, []);

    const suggestBOMCode = (itemCode: string, attributeValueIds: string[] = [], config = codeConfig) => {
        const parts = [];
        if (config.prefix) parts.push(config.prefix);
        if (config.includeItemCode && itemCode) parts.push(itemCode);
        
        if (config.includeVariant && attributeValueIds.length > 0) {
             const valueNames: string[] = [];
             for (const valId of attributeValueIds) {
                 for (const attr of attributes) {
                     const val = attr.values.find((v: any) => v.id === valId);
                     if (val) {
                         if (!config.variantAttributeNames || config.variantAttributeNames.length === 0 || config.variantAttributeNames.includes(attr.name)) {
                             valueNames.push(val.value.toUpperCase().replace(/\s+/g, ''));
                         }
                         break;
                     }
                 }
             }
             if (valueNames.length > 0) parts.push(...valueNames);
        }
        
        const now = new Date();
        if (config.includeYear) parts.push(now.getFullYear());
        if (config.includeMonth) parts.push(String(now.getMonth() + 1).padStart(2, '0'));
        if (config.suffix) parts.push(config.suffix);

        const basePattern = parts.join(config.separator);
        
        let counter = 1;
        let baseCode = `${basePattern}${config.separator}001`;
        
        while (existingBOMs.some((b: any) => b.code === baseCode)) {
            counter++;
            baseCode = `${basePattern}${config.separator}${String(counter).padStart(3, '0')}`;
        }
        return baseCode;
    };

    const handleSaveConfig = (newConfig: CodeConfig) => {
        setCodeConfig(newConfig);
        localStorage.setItem('bom_code_config', JSON.stringify(newConfig));
        if (rootBOM.item_code) {
            const suggested = suggestBOMCode(rootBOM.item_code, rootBOM.attribute_value_ids, newConfig);
            setRootBOM(prev => ({ ...prev, code: suggested }));
        }
    };

    // --- Automation Logic ---
    const handleApplyAutomation = (patterns: string[]) => {
        if (!rootBOM.item_code) return;

        const findMatchingAttributeIds = (childItem: any, parentAttrIds: string[]) => {
            if (!childItem || !childItem.attribute_ids) return [];
            const matches: string[] = [];
            for (const parentValId of parentAttrIds) {
                let attrName = '';
                let valName = '';
                for (const attr of attributes) {
                    const val = attr.values.find((v:any) => v.id === parentValId);
                    if (val) { attrName = attr.name; valName = val.value; break; }
                }
                if (attrName && valName) {
                    const childAttr = attributes.find((a:any) => a.name === attrName && childItem.attribute_ids.includes(a.id));
                    if (childAttr) {
                        const childVal = childAttr.values.find((v:any) => v.value === valName);
                        if (childVal) matches.push(childVal.id);
                    }
                }
            }
            return matches;
        };

        const constructTree = (parentCode: string, parentAttrs: string[], patternIdx: number): any[] => {
            if (patternIdx >= patterns.length) return [];
            const pattern = patterns[patternIdx];
            const expectedChildCode = pattern.replace('{CODE}', rootBOM.item_code);
            const childItem = items.find((i: any) => i.code === expectedChildCode);
            if (!childItem) return [];
            const matchingAttrs = findMatchingAttributeIds(childItem, parentAttrs);
            const subLines = constructTree(rootBOM.item_code, matchingAttrs, patternIdx + 1);
            let subBOM: BOMNodeData | undefined = undefined;
            if (subLines.length > 0) {
                subBOM = {
                    code: suggestBOMCode(childItem.code, matchingAttrs),
                    item_code: childItem.code,
                    attribute_value_ids: matchingAttrs,
                    qty: 1.0,
                    operations: [],
                    lines: subLines
                };
            }
            return [{
                id: Math.random().toString(36).substr(2, 9),
                item_code: childItem.code,
                attribute_value_ids: matchingAttrs,
                qty: 1.0,
                source_location_code: '',
                subBOM: subBOM,
                isExpanded: true
            }];
        };

        const newLines = constructTree(rootBOM.item_code, rootBOM.attribute_value_ids, 0);
        setRootBOM(prev => ({ ...prev, lines: newLines }));
    };

    // --- Recursive Save Logic ---
    const saveNode = async (node: BOMNodeData): Promise<boolean> => {
        for (const line of node.lines) {
            if (line.subBOM) {
                const success = await saveNode(line.subBOM);
                if (!success) return false;
            }
        }
        if (node.lines.length === 0 && node.operations.length === 0) return true;
        try {
            await onSave(node);
            return true;
        } catch (e) {
            return false;
        }
    };

    const handleGlobalSave = async () => {
        await saveNode(rootBOM);
    };

    // --- BOM Node Editor Component ---
    const BOMNodeEditor = ({ node, onChange, level = 0 }: { node: BOMNodeData, onChange: (n: BOMNodeData) => void, level: number }) => {
        const [newLine, setNewLine] = useState<{item_code: string, qty: number, attribute_value_ids: string[]}>({ 
            item_code: '', qty: 0, attribute_value_ids: [] 
        });
        const [newOp, setNewOp] = useState({ operation_id: '', work_center_id: '', sequence: (node.operations.length + 1) * 10, time_minutes: 0 });
        
        const updateField = (field: string, value: any) => {
            const updatedNode = { ...node, [field]: value };
            if (field === 'item_code' && level === 0) {
                updatedNode.code = suggestBOMCode(value, node.attribute_value_ids);
                updatedNode.attribute_value_ids = []; 
            }
            if (field === 'attribute_value_ids' && level === 0) {
                updatedNode.code = suggestBOMCode(node.item_code, value);
            }
            onChange(updatedNode);
        };

        const addLine = () => {
            if (!newLine.item_code || newLine.qty <= 0) return;
            const line: BOMLineNode = {
                id: Math.random().toString(36).substr(2, 9),
                item_code: newLine.item_code,
                attribute_value_ids: newLine.attribute_value_ids,
                qty: newLine.qty,
                source_location_code: ''
            };
            onChange({ ...node, lines: [...node.lines, line] });
            setNewLine({ item_code: '', qty: 0, attribute_value_ids: [] });
        };

        const addOp = () => {
            if (!newOp.operation_id) return;
            onChange({ ...node, operations: [...node.operations, { ...newOp }] });
            setNewOp({ ...newOp, operation_id: '', sequence: newOp.sequence + 10 });
        };

        const removeOp = (index: number) => {
            onChange({ ...node, operations: node.operations.filter((_, i) => i !== index) });
        };

        const updateLine = (index: number, updatedLine: BOMLineNode) => {
            const newLines = [...node.lines];
            newLines[index] = updatedLine;
            onChange({ ...node, lines: newLines });
        };

        const removeLine = (index: number) => {
            onChange({ ...node, lines: node.lines.filter((_, i) => i !== index) });
        };

        const createSubRecipe = (index: number) => {
            const line = node.lines[index];
            const subNode: BOMNodeData = {
                code: suggestBOMCode(line.item_code, line.attribute_value_ids),
                item_code: line.item_code,
                attribute_value_ids: line.attribute_value_ids,
                qty: 1.0,
                operations: [],
                lines: []
            };
            updateLine(index, { ...line, subBOM: subNode, isExpanded: true });
        };

        const removeSubRecipe = (index: number) => {
            const line = node.lines[index];
            updateLine(index, { ...line, subBOM: undefined, isExpanded: false });
        };

        const getItemName = (code: string) => items.find((i: any) => i.code === code)?.name || code;
        const hasExistingBOM = (code: string) => {
             const item = items.find((i:any) => i.code === code);
             return item && existingBOMs.some((b:any) => b.item_id === item.id);
        };
        const getOpName = (id: string) => operations.find((o: any) => o.id === id)?.name || id;
        const getWCName = (id: string) => workCenters.find((w: any) => w.id === id)?.name || id;

        const getBoundAttributes = (itemCode: string) => {
            const item = items.find((i: any) => i.code === itemCode);
            if (!item || !item.attribute_ids) return [];
            return attributes.filter((a: any) => item.attribute_ids.includes(a.id));
        };

        const rootBoundAttrs = getBoundAttributes(node.item_code);
        const newLineBoundAttrs = getBoundAttributes(newLine.item_code);

        const handleAttributeChange = (attrId: string, valueId: string, isRoot: boolean) => {
            const attr = attributes.find((a: any) => a.id === attrId);
            if (!attr) return;
            if (isRoot) {
                const otherValues = node.attribute_value_ids.filter(vid => !attr.values.some((v:any) => v.id === vid));
                const newValues = valueId ? [...otherValues, valueId] : otherValues;
                updateField('attribute_value_ids', newValues);
            } else {
                const otherValues = newLine.attribute_value_ids.filter(vid => !attr.values.some((v:any) => v.id === vid));
                const newValues = valueId ? [...otherValues, valueId] : otherValues;
                setNewLine({...newLine, attribute_value_ids: newValues});
            }
        };

        const getAttributeValueName = (valId: string) => {
            for (const attr of attributes) {
                const val = attr.values.find((v: any) => v.id === valId);
                if (val) return val.value;
            }
            return valId;
        };

        return (
            <div className={`border rounded p-3 mb-3 ${level > 0 ? 'bg-light ms-4 border-start border-4 border-warning shadow-sm' : 'bg-white shadow'}`}>
                {/* Header Section */}
                <div className="row g-3 mb-3 border-bottom pb-3">
                    <div className="col-md-4">
                        <label className="form-label d-flex justify-content-between align-items-center small text-muted">
                            BOM Code
                            {level === 0 && (
                                <i className="bi bi-gear-fill text-muted" style={{cursor: 'pointer'}} onClick={() => setIsConfigOpen(true)}></i>
                            )}
                        </label>
                        <input className="form-control form-control-sm" value={node.code} onChange={e => updateField('code', e.target.value)} />
                    </div>
                    <div className="col-md-6">
                        <label className="form-label d-flex justify-content-between align-items-center small text-muted">
                            Item (Finished Good)
                            {level === 0 && node.item_code && (
                                <button className="btn btn-xs btn-info border py-0 px-2 shadow-sm text-uppercase fw-bold" style={{fontSize: '0.65rem'}} onClick={() => setIsAutomatorOpen(true)}>
                                    <i className="bi bi-magic me-1"></i>Automate
                                </button>
                            )}
                        </label>
                        {level === 0 ? (
                            <select className="form-select form-select-sm fw-bold" value={node.item_code} onChange={e => updateField('item_code', e.target.value)}>
                                <option value="">Select Item to Produce...</option>
                                {items.map((i: any) => <option key={i.id} value={i.code}>{i.name} ({i.code})</option>)}
                            </select>
                        ) : (
                            <div className="fw-bold p-1 bg-light border rounded">{getItemName(node.item_code)} <span className="font-monospace text-muted small ms-2">({node.item_code})</span></div>
                        )}
                        {rootBoundAttrs.length > 0 && (
                            <div className="d-flex flex-wrap gap-2 mt-2">
                                {rootBoundAttrs.map((attr: any) => (
                                    <select key={attr.id} className="form-select form-select-sm" style={{width: 'auto', minWidth: '100px', fontSize: '0.75rem'}} value={node.attribute_value_ids.find(vid => attr.values.some((v:any) => v.id === vid)) || ''} onChange={e => handleAttributeChange(attr.id, e.target.value, true)} disabled={level > 0}>
                                        <option value="">{attr.name}...</option>
                                        {attr.values.map((v: any) => <option key={v.id} value={v.id}>{v.value}</option>)}
                                    </select>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="col-md-2">
                        <label className="form-label small text-muted">Output Qty</label>
                        <input type="number" className="form-control form-control-sm" value={node.qty} onChange={e => updateField('qty', parseFloat(e.target.value))} />
                    </div>
                </div>

                <div className="row g-4">
                    {/* Operations Section */}
                    <div className="col-md-5 border-end">
                        <h6 className="small fw-bold text-muted border-bottom pb-1 mb-3">Routing & Operations</h6>
                        <div className="row g-2 mb-3 align-items-end">
                            <div className="col-2">
                                <label className="small text-muted d-block">Seq</label>
                                <input type="number" className="form-control form-control-sm" value={newOp.sequence} onChange={e => setNewOp({...newOp, sequence: parseInt(e.target.value)})} />
                            </div>
                            <div className="col-6">
                                <label className="small text-muted d-block">Operation</label>
                                <select className="form-select form-select-sm" value={newOp.operation_id} onChange={e => setNewOp({...newOp, operation_id: e.target.value})}>
                                    <option value="">Select...</option>
                                    {operations.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
                                </select>
                            </div>
                            <div className="col-4">
                                <label className="small text-muted d-block">Station</label>
                                <select className="form-select form-select-sm" value={newOp.work_center_id} onChange={e => setNewOp({...newOp, work_center_id: e.target.value})}>
                                    <option value="">Optional...</option>
                                    {workCenters.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                                </select>
                            </div>
                            <div className="col-8 mt-2">
                                <label className="small text-muted d-block">Time (mins)</label>
                                <input type="number" className="form-control form-control-sm" value={newOp.time_minutes} onChange={e => setNewOp({...newOp, time_minutes: parseFloat(e.target.value)})} />
                            </div>
                            <div className="col-4">
                                <button className="btn btn-sm btn-info w-100" onClick={addOp} disabled={!newOp.operation_id}><i className="bi bi-plus"></i> Add</button>
                            </div>
                        </div>
                        <div className="d-flex flex-column gap-1 overflow-auto" style={{maxHeight: '200px'}}>
                            {node.operations.sort((a,b) => a.sequence - b.sequence).map((op, idx) => (
                                <div key={idx} className="d-flex justify-content-between align-items-center p-2 bg-white border rounded small">
                                    <div><span className="badge bg-secondary me-2">{op.sequence}</span> <strong>{getOpName(op.operation_id)}</strong> <span className="text-muted ms-1">({op.time_minutes}m)</span></div>
                                    <button className="btn btn-xs btn-link text-danger p-0" onClick={() => removeOp(idx)}><i className="bi bi-trash"></i></button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Materials Section */}
                    <div className="col-md-7">
                        <h6 className="small fw-bold text-muted border-bottom pb-1 mb-3">Materials / Components</h6>
                        <div className="row g-2 mb-3 align-items-end">
                            <div className="col-md-5">
                                <select className="form-select form-select-sm" value={newLine.item_code} onChange={e => setNewLine({...newLine, item_code: e.target.value, attribute_value_ids: []})}>
                                    <option value="">Add Component...</option>
                                    {items.map((i: any) => <option key={i.id} value={i.code}>{i.name}</option>)}
                                </select>
                            </div>
                            <div className="col-md-5">
                                {newLineBoundAttrs.length > 0 && (
                                    <div className="d-flex flex-wrap gap-1">
                                        {newLineBoundAttrs.map((attr: any) => (
                                            <select key={attr.id} className="form-select form-select-sm" style={{fontSize: '0.7rem', padding: '2px 4px'}} value={newLine.attribute_value_ids.find(vid => attr.values.some((v:any) => v.id === vid)) || ''} onChange={e => handleAttributeChange(attr.id, e.target.value, false)}>
                                                <option value="">{attr.name}...</option>
                                                {attr.values.map((v: any) => <option key={v.id} value={v.id}>{v.value}</option>)}
                                            </select>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="col-md-2 d-flex">
                                <input type="number" className="form-control form-control-sm me-1" placeholder="Qty" value={newLine.qty} onChange={e => setNewLine({...newLine, qty: parseFloat(e.target.value)})} />
                                <button className="btn btn-sm btn-secondary" onClick={addLine} disabled={!newLine.item_code}><i className="bi bi-plus-lg"></i></button>
                            </div>
                        </div>

                        <div className="d-flex flex-column gap-2">
                            {node.lines.map((line, idx) => (
                                <div key={line.id} className="card border-0 bg-transparent">
                                    <div className="d-flex align-items-center justify-content-between p-2 bg-white border rounded">
                                        <div className="d-flex align-items-center gap-2">
                                            {line.subBOM ? (
                                                <button className="btn btn-xs btn-link text-dark p-0" onClick={() => updateLine(idx, { ...line, isExpanded: !line.isExpanded })}>
                                                    <i className={`bi bi-caret-${line.isExpanded ? 'down' : 'right'}-fill`}></i>
                                                </button>
                                            ) : <span style={{width: 12}}></span>}
                                            <span className="fw-medium">{getItemName(line.item_code)}</span>
                                            {line.attribute_value_ids.length > 0 && <span className="text-muted small fst-italic">({line.attribute_value_ids.map(getAttributeValueName).join(', ')})</span>}
                                            <span className="badge bg-secondary">{line.qty}</span>
                                            {hasExistingBOM(line.item_code) && <span className="badge bg-success bg-opacity-10 text-success border border-success">Existing BOM</span>}
                                            {!hasExistingBOM(line.item_code) && !line.subBOM && (
                                                <button className="btn btn-sm btn-warning py-0 px-2 shadow-sm" style={{fontSize: '0.65rem', lineHeight: '1.5'}} onClick={() => createSubRecipe(idx)}>
                                                    <i className="bi bi-diagram-3-fill me-1"></i>Define BOM
                                                </button>
                                            )}
                                            {line.subBOM && <span className="badge bg-primary bg-opacity-10 text-primary border border-primary">Drafting BOM</span>}
                                        </div>
                                        <button className="btn btn-xs btn-link text-danger p-0" onClick={() => removeLine(idx)}><i className="bi bi-x"></i></button>
                                    </div>
                                    {line.isExpanded && line.subBOM && (
                                        <div className="mt-2">
                                            <BOMNodeEditor node={line.subBOM} onChange={(newSubNode) => updateLine(idx, { ...line, subBOM: newSubNode })} level={level + 1} />
                                            <div className="text-end mt-1"><button className="btn btn-xs text-danger small" onClick={() => removeSubRecipe(idx)}>Discard Sub-Recipe</button></div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="modal-body p-4 bg-light">
            <CodeConfigModal isOpen={isConfigOpen} onClose={() => setIsConfigOpen(false)} type="BOM" onSave={handleSaveConfig} initialConfig={codeConfig} attributes={attributes} />
            <BOMAutomatorModal isOpen={isAutomatorOpen} onClose={() => setIsAutomatorOpen(false)} onApply={handleApplyAutomation} />
            <BOMNodeEditor node={rootBOM} onChange={setRootBOM} level={0} />
            <div className="d-flex justify-content-end gap-2 mt-4 pt-3 border-top">
                <button className="btn btn-secondary" onClick={onCancel}>{t('cancel')}</button>
                <button type="submit" className="btn btn-success fw-bold px-4 shadow-sm" onClick={handleGlobalSave}><i className="bi bi-check-lg me-2"></i>Save All Recipes</button>
            </div>
        </div>
    );
}
