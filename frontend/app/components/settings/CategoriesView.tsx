'use client';

import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';

type Category = {
    id: string;
    name: string;
    parent_id: string | null;
    level: number;
    path_names: string[];
    children?: Category[];
};

interface CategoriesViewProps {
    categories: Category[];
    classic?: boolean;
    onCreateCategory: (name: string, parentId?: string) => Promise<void>;
    onDeleteCategory: (id: string) => Promise<void>;
    onRenameCategory: (id: string, name: string) => Promise<void>;
}

type EditingState = { type: 'rename'; id: string; value: string } | null;
type AddingState = { parentId: string | undefined; value: string } | null;

function buildTree(cats: Category[]): Category[] {
    const map = new Map(cats.map(c => [c.id, { ...c, children: [] as Category[] }]));
    const roots: Category[] = [];
    for (const node of map.values()) {
        if (!node.parent_id) roots.push(node);
        else map.get(node.parent_id)?.children?.push(node);
    }
    const sort = (arr: Category[]) => arr.sort((a, b) => a.name.localeCompare(b.name));
    sort(roots);
    roots.forEach(r => { sort(r.children!); r.children!.forEach(c => sort(c.children!)); });
    return roots;
}

// Auto-focus helper component
function AutoFocusInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
    return <input ref={ref} {...props} />;
}

export default function CategoriesView({
    categories,
    onCreateCategory,
    onDeleteCategory,
    onRenameCategory,
}: CategoriesViewProps) {
    const { uiStyle: currentStyle } = useTheme();
    const classic = currentStyle === 'classic';

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [editingState, setEditingState] = useState<EditingState>(null);
    const [addingState, setAddingState] = useState<AddingState>(null);
    const [hoveredId, setHoveredId] = useState<string | null>(null);

    const selectedNode = selectedId ? categories.find(c => c.id === selectedId) ?? null : null;
    const tree = buildTree(
        search
            ? categories.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
            : [...categories]
    );

    // ── Shared action handlers ────────────────────────────────────────────────
    const handleConfirmRename = async () => {
        if (editingState && editingState.value.trim()) {
            await onRenameCategory(editingState.id, editingState.value.trim());
        }
        setEditingState(null);
    };

    const handleConfirmAdd = async () => {
        if (addingState && addingState.value.trim()) {
            await onCreateCategory(addingState.value.trim(), addingState.parentId);
        }
        setAddingState(null);
    };

    const handleDelete = async (id: string) => {
        await onDeleteCategory(id);
        if (selectedId === id) setSelectedId(null);
        if (editingState?.id === id) setEditingState(null);
    };

    const startAdd = (parentId: string | undefined) => {
        setEditingState(null);
        setAddingState({ parentId, value: '' });
    };

    const startRename = (node: Category) => {
        setAddingState(null);
        setEditingState({ type: 'rename', id: node.id, value: node.name });
    };

    // ── XP style helpers ──────────────────────────────────────────────────────
    const xpToolbar: React.CSSProperties = {
        background: 'linear-gradient(to bottom, #f5f4ef, #e0dfd8)',
        borderBottom: '1px solid #b0a898',
        padding: '4px 6px',
        display: 'flex',
        gap: 4,
        alignItems: 'center',
    };
    const xpBtn = (extra: React.CSSProperties = {}): React.CSSProperties => ({
        background: 'linear-gradient(to bottom, #ffffff, #d4d0c8)',
        border: '1px solid',
        borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
        padding: '2px 8px',
        fontFamily: 'Tahoma, Arial, sans-serif',
        fontSize: 11,
        cursor: 'pointer',
        borderRadius: 0,
        ...extra,
    });
    const xpIconBtn = (extra: React.CSSProperties = {}): React.CSSProperties => ({
        background: 'none',
        border: 'none',
        padding: '0 2px',
        fontFamily: 'Tahoma, Arial, sans-serif',
        fontSize: 11,
        cursor: 'pointer',
        borderRadius: 0,
        lineHeight: 1,
        ...extra,
    });
    const xpInput: React.CSSProperties = {
        fontFamily: 'Tahoma, Arial, sans-serif',
        fontSize: 11,
        border: '1px solid #7f9db9',
        boxShadow: 'inset 1px 1px 0 rgba(0,0,0,0.1)',
        background: '#fff',
        padding: '2px 4px',
        outline: 'none',
    };

    // ── Classic add-row renderer ──────────────────────────────────────────────
    const renderAddRowClassic = (level: number): React.ReactNode => {
        const indent = (level - 1) * 16;
        return (
            <div
                key="__adding__"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '1px 4px',
                    paddingLeft: indent + 4,
                    gap: 4,
                }}
            >
                <span style={{ marginRight: 4, fontSize: 10, fontFamily: 'monospace', color: '#999' }}>—</span>
                <AutoFocusInput
                    style={{ ...xpInput, flex: 1 }}
                    placeholder="New category name..."
                    value={addingState?.value ?? ''}
                    onChange={e => setAddingState(s => s ? { ...s, value: e.target.value } : s)}
                    onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); handleConfirmAdd(); }
                        if (e.key === 'Escape') { e.preventDefault(); setAddingState(null); }
                    }}
                />
                <button style={xpBtn()} onClick={handleConfirmAdd} title="Save">✓</button>
                <button style={xpBtn()} onClick={() => setAddingState(null)} title="Cancel">✕</button>
            </div>
        );
    };

    // ── Classic tree node renderer ────────────────────────────────────────────
    const renderNodeClassic = (node: Category): React.ReactNode => {
        const indent = (node.level - 1) * 16;
        const isSelected = node.id === selectedId;
        const isHovered = node.id === hoveredId;
        const isEditing = editingState?.id === node.id;
        const hasChildren = (node.children?.length ?? 0) > 0;
        const chevron = hasChildren ? '▼' : '—';
        const chevronColor = isSelected ? '#fff' : (hasChildren ? '#444' : '#bbb');
        const actionsOpacity = isHovered || isEditing ? 1 : 0;

        if (isEditing) {
            return (
                <div key={node.id}>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '1px 4px',
                            paddingLeft: indent + 4,
                            background: '#316ac5',
                            gap: 4,
                        }}
                    >
                        <span style={{ marginRight: 4, fontSize: 10, color: '#fff', fontFamily: 'monospace' }}>{chevron}</span>
                        <AutoFocusInput
                            style={{ ...xpInput, flex: 1 }}
                            value={editingState.value}
                            onChange={e => setEditingState(s => s ? { ...s, value: e.target.value } : s)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') { e.preventDefault(); handleConfirmRename(); }
                                if (e.key === 'Escape') { e.preventDefault(); setEditingState(null); }
                            }}
                        />
                        <button style={xpBtn()} onClick={handleConfirmRename} title="Save">✓</button>
                        <button style={xpBtn()} onClick={() => setEditingState(null)} title="Cancel">✕</button>
                    </div>
                    {node.children?.map(child => renderNodeClassic(child))}
                    {addingState?.parentId === node.id && renderAddRowClassic(node.level + 1)}
                </div>
            );
        }

        return (
            <div key={node.id}>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '1px 4px',
                        paddingLeft: indent + 4,
                        cursor: 'pointer',
                        fontFamily: 'Tahoma, Arial, sans-serif',
                        fontSize: 11,
                        fontWeight: node.level === 1 ? 'bold' : 'normal',
                        background: isSelected ? '#316ac5' : (isHovered ? '#dde8fb' : 'transparent'),
                        color: isSelected ? '#fff' : '#000',
                        userSelect: 'none' as const,
                        position: 'relative',
                    }}
                    onClick={() => setSelectedId(node.id)}
                    onMouseEnter={() => setHoveredId(node.id)}
                    onMouseLeave={() => setHoveredId(null)}
                >
                    <span style={{ marginRight: 4, fontSize: 10, fontFamily: 'monospace', color: chevronColor }}>{chevron}</span>
                    <span style={{ flex: 1 }}>{node.name}</span>
                    <span style={{ display: 'flex', gap: 2, opacity: actionsOpacity, transition: 'opacity 0.1s' }}>
                        {node.level < 3 && (
                            <button
                                style={xpIconBtn({ color: isSelected ? '#fff' : '#316ac5' })}
                                title="Add child"
                                onClick={e => { e.stopPropagation(); startAdd(node.id); }}
                            >＋</button>
                        )}
                        <button
                            style={xpIconBtn({ color: isSelected ? '#fff' : '#555' })}
                            title="Rename"
                            onClick={e => { e.stopPropagation(); startRename(node); }}
                        >✎</button>
                        <button
                            style={xpIconBtn({ color: isSelected ? '#ffc0c0' : '#c00' })}
                            title="Delete"
                            onClick={e => { e.stopPropagation(); handleDelete(node.id); }}
                        >✕</button>
                    </span>
                </div>
                {node.children?.map(child => renderNodeClassic(child))}
                {addingState?.parentId === node.id && renderAddRowClassic(node.level + 1)}
            </div>
        );
    };

    // ── Modern add-row renderer ───────────────────────────────────────────────
    const renderAddRowModern = (level: number): React.ReactNode => {
        const indent = (level - 1) * 16;
        return (
            <div
                key="__adding__"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '3px 8px',
                    paddingLeft: indent + 8,
                    gap: 4,
                }}
            >
                <span style={{ marginRight: 6, fontSize: 11, color: '#bbb', fontFamily: 'monospace' }}>—</span>
                <AutoFocusInput
                    className="form-control form-control-sm"
                    style={{ flex: 1, border: '1px dashed #0d6efd' }}
                    placeholder="New category name..."
                    value={addingState?.value ?? ''}
                    onChange={e => setAddingState(s => s ? { ...s, value: e.target.value } : s)}
                    onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); handleConfirmAdd(); }
                        if (e.key === 'Escape') { e.preventDefault(); setAddingState(null); }
                    }}
                />
                <button className="btn btn-sm btn-outline-primary" style={{ padding: '1px 6px' }} onClick={handleConfirmAdd} title="Save">✓</button>
                <button className="btn btn-sm btn-outline-secondary" style={{ padding: '1px 6px' }} onClick={() => setAddingState(null)} title="Cancel">✕</button>
            </div>
        );
    };

    // ── Modern tree node renderer ─────────────────────────────────────────────
    const renderNodeModern = (node: Category): React.ReactNode => {
        const indent = (node.level - 1) * 16;
        const isSelected = node.id === selectedId;
        const isHovered = node.id === hoveredId;
        const isEditing = editingState?.id === node.id;
        const hasChildren = (node.children?.length ?? 0) > 0;
        const chevron = hasChildren ? '▼' : '—';
        const chevronColor = isSelected ? 'rgba(255,255,255,0.8)' : (hasChildren ? '#495057' : '#ced4da');
        const actionsOpacity = isHovered || isEditing ? 1 : 0;

        if (isEditing) {
            return (
                <div key={node.id}>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '3px 8px',
                            paddingLeft: indent + 8,
                            background: '#0d6efd',
                            borderRadius: 4,
                            gap: 4,
                        }}
                    >
                        <span style={{ marginRight: 6, fontSize: 11, color: 'rgba(255,255,255,0.8)', fontFamily: 'monospace' }}>{chevron}</span>
                        <AutoFocusInput
                            className="form-control form-control-sm"
                            style={{ flex: 1 }}
                            value={editingState.value}
                            onChange={e => setEditingState(s => s ? { ...s, value: e.target.value } : s)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') { e.preventDefault(); handleConfirmRename(); }
                                if (e.key === 'Escape') { e.preventDefault(); setEditingState(null); }
                            }}
                        />
                        <button className="btn btn-sm btn-light" style={{ padding: '1px 6px' }} onClick={handleConfirmRename} title="Save">✓</button>
                        <button className="btn btn-sm btn-light" style={{ padding: '1px 6px' }} onClick={() => setEditingState(null)} title="Cancel">✕</button>
                    </div>
                    {node.children?.map(child => renderNodeModern(child))}
                    {addingState?.parentId === node.id && renderAddRowModern(node.level + 1)}
                </div>
            );
        }

        return (
            <div key={node.id}>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '3px 8px',
                        paddingLeft: indent + 8,
                        cursor: 'pointer',
                        fontWeight: node.level === 1 ? 600 : 'normal',
                        background: isSelected ? '#0d6efd' : (isHovered ? '#e8f0fe' : 'transparent'),
                        color: isSelected ? '#fff' : '#212529',
                        borderRadius: 4,
                        userSelect: 'none' as const,
                        fontSize: 13,
                        position: 'relative',
                    }}
                    onClick={() => setSelectedId(node.id)}
                    onMouseEnter={() => setHoveredId(node.id)}
                    onMouseLeave={() => setHoveredId(null)}
                >
                    <span style={{ marginRight: 6, fontFamily: 'monospace', fontSize: 11, color: chevronColor }}>{chevron}</span>
                    <span style={{ flex: 1 }}>{node.name}</span>
                    <span style={{ display: 'flex', gap: 2, opacity: actionsOpacity, transition: 'opacity 0.1s' }}>
                        {node.level < 3 && (
                            <button
                                className="btn btn-sm"
                                style={{
                                    padding: '0 4px',
                                    lineHeight: 1.2,
                                    fontSize: 13,
                                    color: isSelected ? '#fff' : '#0d6efd',
                                    background: 'none',
                                    border: 'none',
                                }}
                                title="Add child"
                                onClick={e => { e.stopPropagation(); startAdd(node.id); }}
                            >＋</button>
                        )}
                        <button
                            className="btn btn-sm"
                            style={{
                                padding: '0 4px',
                                lineHeight: 1.2,
                                fontSize: 13,
                                color: isSelected ? '#fff' : '#6c757d',
                                background: 'none',
                                border: 'none',
                            }}
                            title="Rename"
                            onClick={e => { e.stopPropagation(); startRename(node); }}
                        >✎</button>
                        <button
                            className="btn btn-sm"
                            style={{
                                padding: '0 4px',
                                lineHeight: 1.2,
                                fontSize: 13,
                                color: isSelected ? '#ffc0c0' : '#dc3545',
                                background: 'none',
                                border: 'none',
                            }}
                            title="Delete"
                            onClick={e => { e.stopPropagation(); handleDelete(node.id); }}
                        >✕</button>
                    </span>
                </div>
                {node.children?.map(child => renderNodeModern(child))}
                {addingState?.parentId === node.id && renderAddRowModern(node.level + 1)}
            </div>
        );
    };

    // ── Classic mode ─────────────────────────────────────────────────────────
    if (classic) {
        return (
            <div>
                {/* Toolbar */}
                <div style={xpToolbar}>
                    <button
                        style={xpBtn()}
                        onClick={() => startAdd(undefined)}
                    >
                        + Level 1
                    </button>
                    <div style={{ flex: 1 }} />
                    <input
                        style={{ ...xpInput, width: 100 }}
                        placeholder="Search..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>

                {/* Tree */}
                <div style={{
                    background: '#fff',
                    border: '1px solid #7f9db9',
                    boxShadow: 'inset 1px 1px 0 rgba(0,0,0,0.1)',
                    minHeight: 160,
                    maxHeight: 360,
                    overflow: 'auto',
                    padding: 4,
                }}>
                    {tree.length === 0 && !addingState && (
                        <div style={{ color: '#888', fontSize: 11, padding: 8, fontFamily: 'Tahoma, Arial, sans-serif' }}>
                            No categories found.
                        </div>
                    )}
                    {tree.map(node => renderNodeClassic(node))}
                    {addingState?.parentId === undefined && renderAddRowClassic(1)}
                </div>

                {/* Status bar */}
                <div style={{
                    background: '#ece9d8',
                    borderTop: '1px solid #b0a898',
                    padding: '2px 6px',
                    fontSize: 10,
                    color: '#555',
                    display: 'flex',
                    gap: 16,
                    marginTop: 8,
                    fontFamily: 'Tahoma, Arial, sans-serif',
                }}>
                    {selectedNode ? (
                        <>
                            <span>Selected: {selectedNode.name} (Level {selectedNode.level})</span>
                            <span>Path: {selectedNode.path_names.join(' / ')}</span>
                        </>
                    ) : (
                        <span>{categories.length} categories total</span>
                    )}
                </div>
            </div>
        );
    }

    // ── Modern (Bootstrap) mode ───────────────────────────────────────────────
    return (
        <div>
            {/* Toolbar */}
            <div style={{ display: 'flex', gap: 8, padding: '8px 0', alignItems: 'center' }}>
                <button
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => startAdd(undefined)}
                >
                    + Level 1
                </button>
                <div style={{ flex: 1 }} />
                <input
                    className="form-control form-control-sm"
                    style={{ width: 140 }}
                    placeholder="Search..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>

            {/* Tree */}
            <div style={{
                border: '1px solid #dee2e6',
                borderRadius: 4,
                minHeight: 160,
                maxHeight: 360,
                overflow: 'auto',
                padding: 8,
            }}>
                {tree.length === 0 && !addingState && (
                    <div className="text-muted" style={{ fontSize: 13, padding: 8 }}>
                        No categories found.
                    </div>
                )}
                {tree.map(node => renderNodeModern(node))}
                {addingState?.parentId === undefined && renderAddRowModern(1)}
            </div>

            {/* Status bar */}
            <div className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>
                {selectedNode ? (
                    <>Selected: <strong>{selectedNode.name}</strong> (Level {selectedNode.level}) — Path: {selectedNode.path_names.join(' / ')}</>
                ) : (
                    <>{categories.length} categories total</>
                )}
            </div>
        </div>
    );
}
