'use client';

import { useState } from 'react';
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

export default function CategoriesView({
    categories,
    onCreateCategory,
    onDeleteCategory,
    onRenameCategory,
}: CategoriesViewProps) {
    const { uiStyle: currentStyle } = useTheme();
    const classic = currentStyle === 'classic';

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [newName, setNewName] = useState('');
    const [search, setSearch] = useState('');

    const selectedNode = selectedId ? categories.find(c => c.id === selectedId) ?? null : null;
    const tree = buildTree(
        search
            ? categories.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
            : [...categories]
    );

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
    const xpInput: React.CSSProperties = {
        fontFamily: 'Tahoma, Arial, sans-serif',
        fontSize: 11,
        border: '1px solid #7f9db9',
        boxShadow: 'inset 1px 1px 0 rgba(0,0,0,0.1)',
        background: '#fff',
        padding: '2px 4px',
        outline: 'none',
    };

    // ── Tree node renderer ────────────────────────────────────────────────────
    const renderNode = (node: Category): React.ReactNode => {
        const indent = (node.level - 1) * 16;
        const isSelected = node.id === selectedId;
        const rowStyle: React.CSSProperties = {
            display: 'flex',
            alignItems: 'center',
            padding: '1px 4px',
            paddingLeft: indent + 4,
            cursor: 'pointer',
            fontFamily: 'Tahoma, Arial, sans-serif',
            fontSize: 11,
            fontWeight: node.level === 1 ? 'bold' : 'normal',
            background: isSelected ? '#316ac5' : 'transparent',
            color: isSelected ? '#fff' : '#000',
            userSelect: 'none' as const,
        };
        return (
            <div key={node.id}>
                <div style={rowStyle} onClick={() => setSelectedId(node.id)}>
                    <span style={{ marginRight: 4, fontSize: 10, fontFamily: 'monospace' }}>
                        {node.children?.length ? '[-]' : '--'}
                    </span>
                    {node.name}
                </div>
                {node.children?.map(child => renderNode(child))}
            </div>
        );
    };

    // ── Modern mode node renderer ─────────────────────────────────────────────
    const renderNodeModern = (node: Category): React.ReactNode => {
        const indent = (node.level - 1) * 16;
        const isSelected = node.id === selectedId;
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
                        background: isSelected ? '#0d6efd' : 'transparent',
                        color: isSelected ? '#fff' : '#212529',
                        borderRadius: 4,
                        userSelect: 'none',
                        fontSize: 13,
                    }}
                    onClick={() => setSelectedId(node.id)}
                >
                    <span style={{ marginRight: 6, fontFamily: 'monospace', fontSize: 11, opacity: 0.6 }}>
                        {node.children?.length ? '[-]' : '--'}
                    </span>
                    {node.name}
                </div>
                {node.children?.map(child => renderNodeModern(child))}
            </div>
        );
    };

    if (classic) {
        return (
            <div>
                {/* Toolbar */}
                <div style={xpToolbar}>
                    <button
                        style={xpBtn()}
                        onClick={() => { if (newName.trim()) { onCreateCategory(newName.trim()); setNewName(''); } }}
                    >
                        + Level 1
                    </button>
                    <button
                        style={xpBtn(selectedId && selectedNode?.level !== 3 ? {} : { opacity: 0.5, cursor: 'default' })}
                        disabled={!selectedId || selectedNode?.level === 3}
                        onClick={() => {
                            if (newName.trim() && selectedId) { onCreateCategory(newName.trim(), selectedId); setNewName(''); }
                        }}
                    >
                        + Add Child
                    </button>
                    <button
                        style={xpBtn(selectedId ? { borderColor: '#c00000 #800000 #800000 #c00000' } : { opacity: 0.5, cursor: 'default' })}
                        disabled={!selectedId}
                        onClick={() => { if (selectedId) { onDeleteCategory(selectedId); setSelectedId(null); } }}
                    >
                        Delete
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
                    {tree.length === 0 && (
                        <div style={{ color: '#888', fontSize: 11, padding: 8, fontFamily: 'Tahoma, Arial, sans-serif' }}>
                            No categories found.
                        </div>
                    )}
                    {tree.map(node => renderNode(node))}
                </div>

                {/* Rename / new name input */}
                <div style={{ marginTop: 6, display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input
                        style={{ ...xpInput, flex: 1 }}
                        placeholder={selectedId ? 'Type new name to rename, or name for Add...' : 'Type name for + Level 1 or + Add Child...'}
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') {
                                if (selectedId && newName.trim()) { onRenameCategory(selectedId, newName.trim()); setNewName(''); }
                                else if (newName.trim()) { onCreateCategory(newName.trim()); setNewName(''); }
                            }
                        }}
                    />
                    {selectedId && (
                        <button
                            style={xpBtn()}
                            onClick={() => { if (newName.trim()) { onRenameCategory(selectedId, newName.trim()); setNewName(''); } }}
                        >
                            Rename
                        </button>
                    )}
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
                    onClick={() => { if (newName.trim()) { onCreateCategory(newName.trim()); setNewName(''); } }}
                >
                    + Level 1
                </button>
                <button
                    className="btn btn-sm btn-outline-secondary"
                    disabled={!selectedId || selectedNode?.level === 3}
                    onClick={() => {
                        if (newName.trim() && selectedId) { onCreateCategory(newName.trim(), selectedId); setNewName(''); }
                    }}
                >
                    + Add Child
                </button>
                <button
                    className="btn btn-sm btn-outline-danger"
                    disabled={!selectedId}
                    onClick={() => { if (selectedId) { onDeleteCategory(selectedId); setSelectedId(null); } }}
                >
                    Delete
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
                {tree.length === 0 && (
                    <div className="text-muted" style={{ fontSize: 13, padding: 8 }}>
                        No categories found.
                    </div>
                )}
                {tree.map(node => renderNodeModern(node))}
            </div>

            {/* Rename / new name input */}
            <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                    className="form-control form-control-sm"
                    placeholder={selectedId ? 'Type new name to rename, or name for Add...' : 'Type name for + Level 1 or + Add Child...'}
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter') {
                            if (selectedId && newName.trim()) { onRenameCategory(selectedId, newName.trim()); setNewName(''); }
                            else if (newName.trim()) { onCreateCategory(newName.trim()); setNewName(''); }
                        }
                    }}
                />
                {selectedId && (
                    <button
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => { if (newName.trim()) { onRenameCategory(selectedId, newName.trim()); setNewName(''); } }}
                    >
                        Rename
                    </button>
                )}
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
