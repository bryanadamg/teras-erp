'use client';

import SalesOrderView from '../components/sales/SalesOrderView';
import { useData } from '../context/DataContext';
import { useRouter } from 'next/navigation';
import { useToast } from '../components/shared/Toast';
import { useConfirm } from '../context/ConfirmContext';

export default function SalesOrdersPage() {
    const { items, attributes, salesOrders, partners, boms, productionRuns, refreshSalesOrders, authFetch } = useData();
    const { showToast } = useToast();
    const { confirm } = useConfirm();
    const router = useRouter();

    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

    const handleCreateSO = async (p: any) => {
        const res = await authFetch(`${API_BASE}/sales-orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
        if (res.ok) refreshSalesOrders();
        return res;
    };

    const handleDeleteSO = async (id: string) => {
        const confirmed = await confirm({
            title: 'Delete Sales Order',
            message: 'Are you sure you want to delete this sales order?',
            confirmText: 'Delete',
            variant: 'danger'
        });
        if (!confirmed) return;
        const res = await authFetch(`${API_BASE}/sales-orders/${id}`, { method: 'DELETE' });
        if (res.ok) refreshSalesOrders();
    };

    const handleGeneratePR = (so: any) => {
        const soLines: any[] = so.lines || [];

        // Group all lines by (item_id + attribute set) — one group = one BOM
        const attrGroupMap = new Map<string, any[]>();
        soLines.forEach((l: any) => {
            const key = l.item_id + '::' + [...(l.attribute_value_ids || [])].sort().join(',');
            if (!attrGroupMap.has(key)) attrGroupMap.set(key, []);
            attrGroupMap.get(key)!.push(l);
        });

        const coveredSizeIds = new Set<string>();
        (productionRuns || []).forEach((pr: any) => {
            if (String(pr.sales_order_id) !== String(so.id)) return;
            (pr.manufacturing_orders || []).forEach((mo: any) => {
                if (mo.bom_size_id) coveredSizeIds.add(String(mo.bom_size_id));
            });
        });

        const entries: Array<{
            bom_id: string;
            sizes?: { bom_size_id: string; qty: number }[];
            total_qty?: number;
            attribute_value_ids?: string[];
        }> = [];
        let missingBomCount = 0;

        for (const [, groupLines] of attrGroupMap) {
            const firstLine = groupLines[0];
            const lineAttrIds: string[] = firstLine.attribute_value_ids || [];

            // Try exact attribute match first (existing behavior)
            let matchingBOM = boms.find((b: any) => {
                if (b.item_id !== firstLine.item_id) return false;
                const bomAttrIds: string[] = b.attribute_value_ids || [];
                if (lineAttrIds.length !== bomAttrIds.length) return false;
                return lineAttrIds.every((id: string) => bomAttrIds.includes(id));
            });

            // Fallback: base BOM with no attributes (color applied via dyeing)
            if (!matchingBOM) {
                matchingBOM = boms.find((b: any) =>
                    b.item_id === firstLine.item_id &&
                    (b.attribute_value_ids || []).length === 0
                );
            }

            if (!matchingBOM) {
                missingBomCount++;
                continue;
            }

            const bomItem = items.find((it: any) => it.id === matchingBOM!.item_id);
            const useKg = (bomItem?.uom || '').toLowerCase() === 'kg';
            const pickQty = (l: any) => useKg ? (parseFloat(l.qty_kg) || 0) : (parseFloat(l.qty) || 0);

            const linesWithSize = groupLines.filter((l: any) => !!l.bom_size_id);

            if (linesWithSize.length > 0) {
                const uncoveredSizes = linesWithSize
                    .filter((l: any) => !coveredSizeIds.has(String(l.bom_size_id)))
                    .map((l: any) => ({ bom_size_id: l.bom_size_id, qty: pickQty(l) }));
                if (uncoveredSizes.length > 0) {
                    entries.push({
                        bom_id: matchingBOM.id,
                        sizes: uncoveredSizes,
                        attribute_value_ids: lineAttrIds.length > 0 ? lineAttrIds : undefined,
                    });
                }
            } else {
                const sortedLineAttrs = [...lineAttrIds].sort().join(',');
                const covered = (productionRuns || []).some((pr: any) => {
                    if (String(pr.sales_order_id) !== String(so.id)) return false;
                    return (pr.bom_entries || []).some((e: any) => {
                        if (String(e.bom_id) !== String(matchingBOM!.id)) return false;
                        const entryAttrs = [...(e.attribute_value_ids || [])].sort().join(',');
                        return entryAttrs === sortedLineAttrs;
                    });
                });
                if (!covered) {
                    const totalQty = groupLines.reduce((acc: number, l: any) => acc + pickQty(l), 0);
                    entries.push({
                        bom_id: matchingBOM.id,
                        total_qty: totalQty,
                        attribute_value_ids: lineAttrIds.length > 0 ? lineAttrIds : undefined,
                    });
                }
            }
        }

        if (entries.length === 0) {
            if (missingBomCount > 0) {
                showToast(`${missingBomCount} item(s) have no matching BOM. Please create recipes first.`, 'warning');
            } else {
                showToast('All items already have a Production Run.', 'info');
            }
            return;
        }

        const params: Record<string, string> = {
            action: 'create_pr',
            sales_order_id: so.id,
            so_code: so.po_number || '',
            bom_entries: encodeURIComponent(JSON.stringify(entries)),
        };
        router.push(`/production-runs?${new URLSearchParams(params).toString()}`);
    };

    const handleUpdateSO = async (id: string, payload: any) => {
        const res = await authFetch(`${API_BASE}/sales-orders/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (res.ok) refreshSalesOrders();
        return res;
    };

    const handleUpdateSOStatus = async (soId: string, status: string) => {
        const res = await authFetch(`${API_BASE}/sales-orders/${soId}/status?status=${status}`, { method: 'PUT' });
        if (res.ok) {
            refreshSalesOrders();
            showToast(`Order status updated to ${status}`, 'success');
        } else {
            const err = await res.json();
            showToast(`Error: ${err.detail}`, 'danger');
        }
    };

    return (
            <SalesOrderView
                items={items}
                attributes={attributes}
                boms={boms}
                salesOrders={salesOrders}
                partners={partners}
                onCreateSO={handleCreateSO}
                onDeleteSO={handleDeleteSO}
                onEditSO={handleUpdateSO}
                onUpdateSOStatus={handleUpdateSOStatus}
                onGenerateWO={handleGeneratePR}
                productionRuns={productionRuns}
            />
    );}
