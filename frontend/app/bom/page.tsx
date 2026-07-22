'use client';

import BOMView from '../components/bom/BOMView';
import { useData } from '../context/DataContext';
import { useConfirm } from '../context/ConfirmContext';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useCallback } from 'react';

const BOM_PAGE_SIZE = 50;

export default function BOMPage() {
    const { items, attributes, sizes, locations, operations, workCenters, partners, companyProfile, productionRuns, fetchData, authFetch, filters } = useData();
    const { confirm } = useConfirm();
    const searchParams = useSearchParams();
    const [initialCreateState, setInitialCreateState] = useState<any>(null);
    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

    // Self-managed paginated BOM list (decoupled from DataContext)
    const [bomList, setBomList] = useState<any[]>([]);
    const [bomTotal, setBomTotal] = useState(0);
    const [bomPage, setBomPage] = useState(1);
    const [bomSearch, setBomSearch] = useState('');
    const [showRootOnly, setShowRootOnly] = useState(true);
    const [bomLoading, setBomLoading] = useState(false);

    const fetchBomList = useCallback(async (page = bomPage, search = bomSearch, rootOnly = showRootOnly) => {
        setBomLoading(true);
        try {
            const skip = (page - 1) * BOM_PAGE_SIZE;
            const params = new URLSearchParams({ skip: String(skip), limit: String(BOM_PAGE_SIZE) });
            if (search) params.set('search', search);
            if (rootOnly) params.set('root_only', 'true');
            const res = await authFetch(`${API_BASE}/boms/summary?${params}`);
            if (res.ok) {
                const data = await res.json();
                setBomList(data.items);
                setBomTotal(data.total);
            }
        } finally {
            setBomLoading(false);
        }
    }, [bomPage, bomSearch, showRootOnly, authFetch, API_BASE]);

    // Initial load
    useEffect(() => { fetchBomList(1, bomSearch, showRootOnly); }, []);

    // Page change → immediate fetch
    useEffect(() => { fetchBomList(bomPage, bomSearch, showRootOnly); }, [bomPage]);

    // Root-only toggle → reset to page 1 + fetch
    useEffect(() => { setBomPage(1); fetchBomList(1, bomSearch, showRootOnly); }, [showRootOnly]);

    // Search → debounce 350ms, reset to page 1
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const handleBomSearch = useCallback((term: string) => {
        setBomSearch(term);
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => {
            setBomPage(1);
            fetchBomList(1, term, showRootOnly);
        }, 350);
    }, [showRootOnly, fetchBomList]);
    useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);

    useEffect(() => {
        if (searchParams.get('action') === 'create_bom') {
            setInitialCreateState({
                item_id: searchParams.get('item_id'),
                attribute_value_ids: searchParams.get('attribute_value_ids'),
            });
        }
    }, [searchParams]);

    const handleClearInitialState = () => setInitialCreateState(null);

    // Item search debounce (for the BOM designer item picker — triggers DataContext item reload)
    const setItemSearch = filters.setItemSearch;
    const itemSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const handleItemSearch = useCallback((term: string) => {
        if (itemSearchTimer.current) clearTimeout(itemSearchTimer.current);
        itemSearchTimer.current = setTimeout(() => setItemSearch(term), 350);
    }, [setItemSearch]);
    useEffect(() => () => { if (itemSearchTimer.current) clearTimeout(itemSearchTimer.current); }, []);

    // /bom no longer auto-fetches the paginated items array (BOMView list renders
    // off itemIndex). Pull it on demand for the BOMDesigner picker — first designer
    // open / deep-link create. fetchData dedupes concurrent identical targets.
    const handleEnsureItems = useCallback(() => {
        if (items.length > 0) return;
        fetchData('bom-items');
    }, [items.length, fetchData]);

    // After mutations: refresh BOM list + DataContext (items/attributes may have changed)
    const afterMutation = useCallback(() => {
        fetchBomList(bomPage, bomSearch, showRootOnly);
        fetchData();
    }, [fetchBomList, fetchData, bomPage, bomSearch, showRootOnly]);

    const handleCreateBOM = async (p: any) => {
        const res = await authFetch(`${API_BASE}/boms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
        if (res.ok) afterMutation();
        return res;
    };

    const handleCreateItem = async (p: any) => {
        const res = await authFetch(`${API_BASE}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
        if (res.ok) fetchData();
        return res;
    };

    const handleUpdateBOM = async (id: string, p: any) => {
        const res = await authFetch(`${API_BASE}/boms/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
        if (res.ok) afterMutation();
        return res;
    };

    const handleDeleteBOM = async (id: string) => {
        const confirmed = await confirm({
            title: 'Delete BOM',
            message: 'Delete this BOM and all sub-BOMs beneath it? This action cannot be undone.',
            confirmText: 'Delete',
            variant: 'danger',
        });
        if (!confirmed) return;
        const res = await authFetch(`${API_BASE}/boms/${id}`, { method: 'DELETE' });
        if (res.ok) afterMutation();
        return res;
    };

    const handleUploadBOMPhoto = async (bomId: string, file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        const res = await authFetch(`${API_BASE}/boms/${bomId}/sample-photo`, { method: 'POST', body: formData });
        if (res.ok) afterMutation();
    };

    const handleUploadBOMDesign = async (bomId: string, file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        const res = await authFetch(`${API_BASE}/boms/${bomId}/design-file`, { method: 'POST', body: formData });
        if (res.ok) afterMutation();
    };

    const handleFetchBOMTree = async (id: string) => {
        const res = await authFetch(`${API_BASE}/boms/${id}/tree`);
        if (!res.ok) return null;
        return res.json();
    };

    const handleCreateProductionRun = async (p: any) => {
        const res = await authFetch(`${API_BASE}/production-runs`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p),
        });
        if (res.ok) fetchData();
        return res;
    };

    const handleDeleteMultipleBOMs = async (ids: string[]) => {
        const confirmed = await confirm({
            title: 'Delete BOMs',
            message: `Delete ${ids.length} BOM(s)? This action cannot be undone.`,
            confirmText: 'Delete',
            variant: 'danger',
        });
        if (!confirmed) return;
        await Promise.all(ids.map(id => authFetch(`${API_BASE}/boms/${id}`, { method: 'DELETE' })));
        afterMutation();
    };

    return (
        <BOMView
            items={items}
            attributes={attributes}
            sizes={sizes}
            boms={bomList}
            bomPage={bomPage}
            bomTotal={bomTotal}
            bomPageSize={BOM_PAGE_SIZE}
            bomSearch={bomSearch}
            onBomSearch={handleBomSearch}
            setBomPage={setBomPage}
            showRootOnly={showRootOnly}
            setShowRootOnly={setShowRootOnly}
            bomLoading={bomLoading}
            operations={operations}
            workCenters={workCenters}
            partners={partners}
            onCreateBOM={handleCreateBOM}
            onUpdateBOM={handleUpdateBOM}
            onFetchBOMTree={handleFetchBOMTree}
            onUploadBOMPhoto={handleUploadBOMPhoto}
            onUploadBOMDesign={handleUploadBOMDesign}
            onDeleteBOM={handleDeleteBOM}
            onDeleteMultipleBOMs={handleDeleteMultipleBOMs}
            onSearchItem={handleItemSearch}
            onCreateItem={handleCreateItem}
            locations={locations || []}
            onCreateProductionRun={handleCreateProductionRun}
            productionRuns={productionRuns || []}
            companyProfile={companyProfile}
            initialCreateState={initialCreateState}
            onClearInitialState={handleClearInitialState}
            onEnsureItems={handleEnsureItems}
        />
    );
}
