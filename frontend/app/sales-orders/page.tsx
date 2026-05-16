'use client';

import SalesOrderView from '../components/sales/SalesOrderView';
import { useData } from '../context/DataContext';
import { useRouter } from 'next/navigation';
import { useToast } from '../components/shared/Toast';
import { useConfirm } from '../context/ConfirmContext';

export default function SalesOrdersPage() {
    const { items, attributes, salesOrders, partners, boms, productionRuns, fetchData, authFetch } = useData();
    const { showToast } = useToast();
    const { confirm } = useConfirm();
    const router = useRouter();

    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

    const handleCreateSO = async (p: any) => {
        const res = await authFetch(`${API_BASE}/sales-orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
        if (res.ok) fetchData();
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
        if (res.ok) fetchData();
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

        const entries: Array<{ bom_id: string; sizes?: { bom_size_id: string; qty: number }[]; total_qty?: number }> = [];
        let missingBomCount = 0;

        for (const [, groupLines] of attrGroupMap) {
            const firstLine = groupLines[0];
            const matchingBOM = boms.find((b: any) => {
                if (b.item_id !== firstLine.item_id) return false;
                const bomAttrIds = b.attribute_value_ids || [];
                const lineAttrIds = firstLine.attribute_value_ids || [];
                if (lineAttrIds.length !== bomAttrIds.length) return false;
                return lineAttrIds.every((id: string) => bomAttrIds.includes(id));
            });

            if (!matchingBOM) {
                missingBomCount++;
                continue;
            }

            const linesWithSize = groupLines.filter((l: any) => !!l.bom_size_id);

            if (linesWithSize.length > 0) {
                const uncoveredSizes = linesWithSize
                    .filter((l: any) => !coveredSizeIds.has(String(l.bom_size_id)))
                    .map((l: any) => ({ bom_size_id: l.bom_size_id, qty: parseFloat(l.qty) || 0 }));
                if (uncoveredSizes.length > 0) {
                    entries.push({ bom_id: matchingBOM.id, sizes: uncoveredSizes });
                }
            } else {
                const covered = (productionRuns || []).some((pr: any) => {
                    if (String(pr.sales_order_id) !== String(so.id)) return false;
                    if (String(pr.bom_id) === String(matchingBOM.id)) return true;
                    return (pr.bom_entries || []).some((e: any) => String(e.bom_id) === String(matchingBOM.id));
                });
                if (!covered) {
                    const totalQty = groupLines.reduce((acc: number, l: any) => acc + (parseFloat(l.qty) || 0), 0);
                    entries.push({ bom_id: matchingBOM.id, total_qty: totalQty });
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
            bom_entries: encodeURIComponent(JSON.stringify(entries)),
        };
        router.push(`/production-runs?${new URLSearchParams(params).toString()}`);
    };

    const handleUpdateSOStatus = async (soId: string, status: string) => {
        const res = await authFetch(`${API_BASE}/sales-orders/${soId}/status?status=${status}`, { method: 'PUT' });
        if (res.ok) {
            fetchData();
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
                onUpdateSOStatus={handleUpdateSOStatus}
                onGenerateWO={handleGeneratePR}
                productionRuns={productionRuns}
            />
    );}
