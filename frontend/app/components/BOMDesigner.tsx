import { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import CodeConfigModal, { CodeConfig } from './CodeConfigModal';
import BOMAutomatorModal from './BOMAutomatorModal';

// Types for Recursive Structure
interface BOMLineNode {
    id: string; 
    item_code: string;
    attribute_value_ids: string[];
    qty: number;
    source_location_code: string;
    subBOM?: BOMNodeData; 
    isNewItem?: boolean;
}

interface BOMNodeData {
    id: string; // Unique ID for selecting in tree
    code: string;
    item_code: string; 
    attribute_value_ids: string[];
    qty: number;
    operations: any[];
    lines: BOMLineNode[];
    isNewItem?: boolean;
}

export default function BOMDesigner({ 
    rootItemCode, 
    items, 
    locations, 
    attributes, 
    workCenters, 
    operations, 
    onSave, 
    onCreateItem,
    onCancel,
    existingBOMs 
}: any) {
    const { t } = useLanguage();
    
    // State
    const [rootBOM, setRootBOM] = useState<BOMNodeData>({
        id: 'root',
        code: '',
        item_code: rootItemCode || '',
        attribute_value_ids: [],
        qty: 1.0,
        operations: [],
        lines: []
    });

    const [selectedNodeId, setSelectedNodeId] = useState<string>('root');
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const [isAutomatorOpen, setIsAutomatorOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    
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

    useEffect(() => {
        const savedConfig = localStorage.getItem('bom_code_config');
        if (savedConfig) {
            try { setCodeConfig(JSON.parse(savedConfig)); } catch (e) {}
        }
    }, []);

    // --- Helpers ---
    const getItemName = (code: string) => items.find((i: any) => i.code === code)?.name || code;
    const hasExistingBOM = (code: string) => {
         const item = items.find((i:any) => i.code === code);
         return item && existingBOMs.some((b:any) => b.item_id === item.id);
    };
    const getOpName = (id: string) => operations.find((o: any) => o.id === id)?.name || id;
    const getWCName = (id: string) => workCenters.find((w: any) => w.id === id)?.name || id;
    const getAttributeValueName = (valId: string) => {
        for (const attr of attributes) {
            const val = attr.values.find((v: any) => v.id === valId);
            if (val) return val.value;
        }
        return valId;
    };

    // --- Logic ---
    const suggestBOMCode = (itemCode: string, attributeValueIds: string[] = [], config = codeConfig) => {
        const parts = [];
        if (config.prefix) parts.push(config.prefix);
        if (config.includeItemCode && itemCode) parts.push(itemCode);
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

    const handleApplyAutomation = (patterns: string[]) => {
        if (!rootBOM.item_code) return;

        const findMatchingAttributeIds = (childItemCode: string, parentAttrIds: string[]) => {
            const childItem = items.find((i: any) => i.code === childItemCode);
            if (!childItem || !childItem.attribute_ids) return [];
            const matches: string[] = [];
            for (const parentValId of parentAttrIds) {
                let attrName = ''; let valName = '';
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
            const isNewItem = !childItem;
            const matchingAttrs = isNewItem ? parentAttrs : findMatchingAttributeIds(expectedChildCode, parentAttrs);
            const subLines = constructTree(rootBOM.item_code, matchingAttrs, patternIdx + 1);
            let subBOM: BOMNodeData | undefined = undefined;
            if (subLines.length > 0 || isNewItem) {
                subBOM = {
                    id: Math.random().toString(36).substr(2, 9),
                    code: suggestBOMCode(expectedChildCode, matchingAttrs),
                    item_code: expectedChildCode,
                    attribute_value_ids: matchingAttrs,
                    qty: 1.0,
                    operations: [],
                    lines: subLines,
                    isNewItem: isNewItem
                };
            }
            return [{
                id: Math.random().toString(36).substr(2, 9),
                item_code: expectedChildCode,
                attribute_value_ids: matchingAttrs,
                qty: 1.0,
                source_location_code: '',
                subBOM: subBOM,
                isNewItem: isNewItem
            }];
        };

        const newLines = constructTree(rootBOM.item_code, rootBOM.attribute_value_ids, 0);
        setRootBOM(prev => ({ ...prev, lines: newLines }));
    };

    const saveNode = async (node: BOMNodeData): Promise<boolean> => {
        let item = items.find((i: any) => i.code === node.item_code);
        if (!item || node.isNewItem) {
            const rootItem = items.find((i: any) => i.code === rootBOM.item_code);
            const res = await onCreateItem({
                code: node.item_code, name: node.item_code, 
                uom: rootItem?.uom || 'pcs', category: 'WIP', attribute_ids: [] 
            });
            if (!res.ok) return false;
            item = await res.json();
        }
        for (const line of node.lines) {
            if (line.isNewItem && !line.subBOM) {
                const rootItem = items.find((i: any) => i.code === rootBOM.item_code);
                await onCreateItem({ code: line.item_code, name: line.item_code, uom: rootItem?.uom || 'pcs', category: 'WIP', attribute_ids: [] });
            }
            if (line.subBOM) {
                const success = await saveNode(line.subBOM);
                if (!success) return false;
            }
        }
        if (node.lines.length === 0 && node.operations.length === 0) return true;
        try { await onSave(node); return true; } catch (e) { return false; }
    };

    const handleGlobalSave = async () => {
        setIsSaving(true);
        const success = await saveNode(rootBOM);
        setIsSaving(false);
        if (success) onCancel();
    };

    // --- Search / Update node in tree ---
    const findNodeAndReplace = (root: BOMNodeData, targetId: string, newNode: BOMNodeData): BOMNodeData => {
        if (root.id === targetId) return newNode;
        return {
            ...root,
            lines: root.lines.map(line => ({
                ...line,
                subBOM: line.subBOM ? findNodeAndReplace(line.subBOM, targetId, newNode) : undefined
            }))
        };
    };

    const findNodeById = (root: BOMNodeData, id: string): BOMNodeData | null => {
        if (root.id === id) return root;
        for (const line of root.lines) {
            if (line.subBOM) {
                const found = findNodeById(line.subBOM, id);
                if (found) return found;
            }
        }
        return null;
    };

    const updateSelectedNode = (updatedFields: Partial<BOMNodeData>) => {
        const selected = findNodeById(rootBOM, selectedNodeId);
        if (!selected) return;
        const newNode = { ...selected, ...updatedFields };
        setRootBOM(prev => findNodeAndReplace(prev, selectedNodeId, newNode));
    };

    // --- Components ---

    const TreeView = ({ node, level = 0 }: { node: BOMNodeData, level: number }) => {
        return (
            <div className="tree-node">
                <div 
                    className={`d-flex align-items-center p-2 rounded mb-1 cursor-pointer ${selectedNodeId === node.id ? 'bg-primary text-white shadow-sm' : 'hover-bg-light'}`}
                    style={{ paddingLeft: `${level * 16 + 8}px`, cursor: 'pointer' }}
                    onClick={() => setSelectedNodeId(node.id)}
                >
                    <i className={`bi ${level === 0 ? 'bi-box-seam-fill' : 'bi-diagram-3'} me-2`}></i>
                    <span className="text-truncate small fw-bold">{node.item_code || 'Unnamed'}</span>
                    {node.isNewItem && <span className="badge bg-danger ms-2" style={{fontSize: '0.5rem'}}>NEW</span>}
                </div>
                {node.lines.map(line => line.subBOM && (
                    <TreeView key={line.subBOM.id} node={line.subBOM} level={level + 1} />
                ))}
            </div>
        );
    };

    const selectedNode = findNodeById(rootBOM, selectedNodeId);

    return (
        <div className="d-flex flex-column h-100 bg-white" style={{ minHeight: '80vh' }}>
            <CodeConfigModal isOpen={isConfigOpen} onClose={() => setIsConfigOpen(false)} type="BOM" onSave={(cfg) => {
                setCodeConfig(cfg);
                if (rootBOM.item_code) setRootBOM(p => ({...p, code: suggestBOMCode(p.item_code, p.attribute_value_ids, cfg)}));
            }} initialConfig={codeConfig} attributes={attributes} />
            <BOMAutomatorModal isOpen={isAutomatorOpen} onClose={() => setIsAutomatorOpen(false)} onApply={handleApplyAutomation} />

            <div className="row g-0 flex-grow-1 overflow-hidden">
                {/* LEFT: Tree Nav */}
                <div className="col-md-3 border-end bg-light d-flex flex-column h-100">
                    <div className="p-3 border-bottom bg-white">
                        <h6 className="small fw-bold text-uppercase text-muted mb-0">Product Structure</h6>
                    </div>
                    <div className="p-2 flex-grow-1 overflow-auto">
                        <TreeView node={rootBOM} level={0} />
                    </div>
                </div>

                {/* RIGHT: Detail Editor */}
                <div className="col-md-9 d-flex flex-column h-100 bg-white">
                    {selectedNode ? (
                        <div className="p-4 overflow-auto">
                            <div className="d-flex justify-content-between align-items-start mb-4 border-bottom pb-3">
                                <div>
                                    <h4 className="fw-bold mb-1">{getItemName(selectedNode.item_code)}</h4>
                                    <p className="text-muted small mb-0 font-monospace">{selectedNode.item_code}</p>
                                </div>
                                {selectedNodeId === 'root' && (
                                    <button className="btn btn-sm btn-info shadow-sm" onClick={() => setIsAutomatorOpen(true)}>
                                        <i className="bi bi-magic me-1"></i>Automate All Levels
                                    </button>
                                )}
                            </div>

                            <div className="row g-4">
                                <div className="col-md-4">
                                    <label className="form-label small text-muted d-flex justify-content-between">
                                        BOM Code
                                        {selectedNodeId === 'root' && <i className="bi bi-gear-fill cursor-pointer" onClick={() => setIsConfigOpen(true)}></i>}
                                    </label>
                                    <input className="form-control" value={selectedNode.code} onChange={e => updateSelectedNode({ code: e.target.value })} />
                                </div>
                                <div className="col-md-5">
                                    <label className="form-label small text-muted">Finished Item</label>
                                    {selectedNodeId === 'root' ? (
                                        <select className="form-select" value={selectedNode.item_code} onChange={e => {
                                            const code = e.target.value;
                                            const item = items.find((i:any) => i.code === code);
                                            setRootBOM(prev => ({
                                                ...prev,
                                                item_code: code,
                                                code: suggestBOMCode(code, prev.attribute_value_ids),
                                                attribute_value_ids: []
                                            }));
                                        }}>
                                            <option value="">Select Item...</option>
                                            {items.map((i: any) => <option key={i.id} value={i.code}>{i.name} ({i.code})</option>)}
                                        </select>
                                    ) : (
                                        <div className="form-control bg-light">{getItemName(selectedNode.item_code)}</div>
                                    )}
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label small text-muted">Batch Size</label>
                                    <input type="number" className="form-control" value={selectedNode.qty} onChange={e => updateSelectedNode({ qty: parseFloat(e.target.value) })} />
                                </div>
                            </div>

                            {/* Node Attributes */}
                            <div className="mt-3 d-flex flex-wrap gap-2">
                                {attributes.filter((a:any) => {
                                    const itm = items.find((i:any) => i.code === selectedNode.item_code);
                                    return itm?.attribute_ids?.includes(a.id);
                                }).map((attr:any) => (
                                    <div key={attr.id} style={{minWidth: '150px'}}>
                                        <label className="extra-small text-muted">{attr.name}</label>
                                        <select className="form-select form-select-sm" value={selectedNode.attribute_value_ids.find(v => attr.values.some((av:any) => av.id === v)) || ''}
                                            onChange={e => {
                                                const attrValId = e.target.value;
                                                const others = selectedNode.attribute_value_ids.filter(v => !attr.values.some((av:any) => av.id === v));
                                                const newVals = attrValId ? [...others, attrValId] : others;
                                                updateSelectedNode({ attribute_value_ids: newVals, code: selectedNodeId === 'root' ? suggestBOMCode(selectedNode.item_code, newVals) : selectedNode.code });
                                            }}
                                        >
                                            <option value="">Any...</option>
                                            {attr.values.map((v:any) => <option key={v.id} value={v.id}>{v.value}</option>)}
                                        </select>
                                    </div>
                                ))}
                            </div>

                            <hr className="my-4" />

                            <div className="row g-4">
                                {/* Ops */}
                                <div className="col-lg-5">
                                    <div className="card h-100 border shadow-none bg-light bg-opacity-50">
                                        <div className="card-header bg-transparent border-0"><h6 className="fw-bold mb-0">Production Steps</h6></div>
                                        <div className="card-body">
                                            <div className="input-group input-group-sm mb-3">
                                                <select className="form-select" id="addOpSel">
                                                    <option value="">Add Operation...</option>
                                                    {operations.map((o:any) => <option key={o.id} value={o.id}>{o.name}</option>)}
                                                </select>
                                                <button className="btn btn-secondary" onClick={() => {
                                                    const sel = document.getElementById('addOpSel') as HTMLSelectElement;
                                                    if (sel.value) {
                                                        const newOps = [...selectedNode.operations, { operation_id: sel.value, sequence: (selectedNode.operations.length + 1) * 10, time_minutes: 0 }];
                                                        updateSelectedNode({ operations: newOps });
                                                        sel.value = "";
                                                    }
                                                }}><i className="bi bi-plus-lg"></i></button>
                                            </div>
                                            <div className="list-group list-group-flush border rounded bg-white">
                                                {selectedNode.operations.sort((a,b) => a.sequence - b.sequence).map((op, i) => (
                                                    <div key={i} className="list-group-item d-flex justify-content-between align-items-center py-2">
                                                        <span className="small fw-bold text-muted">{op.sequence}. {getOpName(op.operation_id)}</span>
                                                        <button className="btn btn-xs text-danger p-0" onClick={() => updateSelectedNode({ operations: selectedNode.operations.filter((_, idx) => idx !== i) })}><i className="bi bi-trash"></i></button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Materials */}
                                <div className="col-lg-7">
                                    <div className="card h-100 border shadow-none">
                                        <div className="card-header bg-transparent border-0 d-flex justify-content-between">
                                            <h6 className="fw-bold mb-0">Components</h6>
                                        </div>
                                        <div className="card-body">
                                            {/* (Line add logic simplified for brevity but fully functional) */}
                                            <div className="input-group input-group-sm mb-3">
                                                <select className="form-select" id="addLineItm" style={{width: '50%'}}>
                                                    <option value="">Component...</option>
                                                    {items.map((i:any) => <option key={i.id} value={i.code}>{i.name}</option>)}
                                                </select>
                                                <input type="number" className="form-control" id="addLineQty" placeholder="Qty" style={{width: '20%'}} />
                                                <button className="btn btn-primary" onClick={() => {
                                                    const itm = document.getElementById('addLineItm') as HTMLSelectElement;
                                                    const qty = document.getElementById('addLineQty') as HTMLInputElement;
                                                    if (itm.value && qty.value) {
                                                        const newLine: BOMLineNode = {
                                                            id: Math.random().toString(36).substr(2, 9),
                                                            item_code: itm.value,
                                                            attribute_value_ids: [],
                                                            qty: parseFloat(qty.value),
                                                            source_location_code: '',
                                                            isNewItem: !items.some((i:any) => i.code === itm.value)
                                                        };
                                                        updateSelectedNode({ lines: [...selectedNode.lines, newLine] });
                                                        itm.value = ""; qty.value = "";
                                                    }
                                                }}><i className="bi bi-plus-lg"></i></button>
                                            </div>

                                            <div className="d-flex flex-column gap-2">
                                                {selectedNode.lines.map((line, i) => (
                                                    <div key={line.id} className="p-2 border rounded d-flex justify-content-between align-items-center bg-white">
                                                        <div className="d-flex align-items-center gap-2">
                                                            <span className="fw-bold small">{getItemName(line.item_code)}</span>
                                                            <span className="badge bg-secondary">{line.qty}</span>
                                                            {!hasExistingBOM(line.item_code) && !line.subBOM && (
                                                                <button className="btn btn-xs btn-warning py-0 px-2" onClick={() => {
                                                                    const subNode: BOMNodeData = {
                                                                        id: Math.random().toString(36).substr(2, 9),
                                                                        code: suggestBOMCode(line.item_code, line.attribute_value_ids),
                                                                        item_code: line.item_code,
                                                                        attribute_value_ids: line.attribute_value_ids,
                                                                        qty: 1.0, operations: [], lines: [], isNewItem: line.isNewItem
                                                                    };
                                                                    const newLines = [...selectedNode.lines];
                                                                    newLines[i] = { ...line, subBOM: subNode };
                                                                    updateSelectedNode({ lines: newLines });
                                                                    setSelectedNodeId(subNode.id);
                                                                }}>Define BOM</button>
                                                            )}
                                                            {line.subBOM && <span className="badge bg-info cursor-pointer" onClick={() => setSelectedNodeId(line.subBOM!.id)}>Draft Defined <i className="bi bi-arrow-right-short"></i></span>}
                                                        </div>
                                                        <button className="btn btn-xs text-danger p-0" onClick={() => updateSelectedNode({ lines: selectedNode.lines.filter((_, idx) => idx !== i) })}><i className="bi bi-trash"></i></button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-100 d-flex align-items-center justify-content-center text-muted">Select a part from the tree to edit its recipe</div>
                    )}

                    {/* FOOTER */}
                    <div className="mt-auto p-3 border-top bg-light d-flex justify-content-end gap-2">
                        <button className="btn btn-secondary" onClick={onCancel}>{t('cancel')}</button>
                        <button className="btn btn-success fw-bold px-4" onClick={handleGlobalSave} disabled={isSaving}>
                            {isSaving ? 'Processing...' : 'Finish & Save Tree'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
