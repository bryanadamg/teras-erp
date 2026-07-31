/**
 * Row sources for `table` bands.
 *
 * A source turns the render context into a flat row list plus the columns it can
 * offer. The step-material filter below is lifted verbatim from the old
 * KartuKerjaCard*.tsx bodies (all four had an identical copy): BOM lines tied to
 * an operation on this WO's work center, falling back to *all* BOM lines when the
 * step has no material mapped.
 */

import type { PrintContext } from './renderContext';

export interface SourceColumnDef {
    field: string;
    label: string;
    /** Right-align and honour `decimals` in the renderer. */
    numeric?: boolean;
}

export interface SourceResult {
    rows: Record<string, any>[];
    /**
     * Title the source suggests for the band. Bands whose `title` is the literal
     * `'{auto}'` render this instead — that keeps the old
     * "Komponen Operasi Ini" vs "Material (berdasarkan BOM)" switch working while
     * still letting the client pin a fixed title.
     */
    autoTitle?: string;
}

export interface RowSourceDef {
    id: string;
    label: string;
    columns: SourceColumnDef[];
    resolve: (ctx: PrintContext) => SourceResult;
}

const BOM_STEP_LINES: RowSourceDef = {
    id: 'bom_step_lines',
    label: 'Step Materials (BOM lines for this WO)',
    columns: [
        { field: 'item', label: 'Komponen' },
        { field: 'item_code', label: 'Item Code' },
        { field: 'item_name', label: 'Item Name' },
        { field: 'required_qty', label: 'Perlu', numeric: true },
        { field: 'actual_qty', label: 'Aktual', numeric: true },
        { field: 'variance', label: 'Selisih', numeric: true },
        { field: 'percentage', label: '%', numeric: true },
    ],
    resolve: (ctx) => {
        const wo = ctx.workOrder || {};
        const mo = ctx.parentMO || {};
        const woQty = Number(wo.qty ?? 0);

        const allBomLines: any[] = mo?.bom?.lines || [];
        const bomOps: any[] = mo?.bom?.operations || [];
        const woWcId = String(wo.work_center_id || '');
        const stepOpIds = new Set(
            bomOps
                .filter((op: any) => woWcId && String(op.work_center_id || '') === woWcId)
                .map((op: any) => String(op.id))
        );
        const stepLines = allBomLines.filter(
            (l: any) => l.bom_operation_id && stepOpIds.has(String(l.bom_operation_id))
        );
        const usedAllLines = stepLines.length === 0;
        const bomLines = usedAllLines ? allBomLines : stepLines;

        // Actual consumed materials logged against this WO, summed across completions.
        const actualByItem: Record<string, number> = {};
        (mo?.completions || [])
            .filter((c: any) => String(c.work_order_id || '') === String(wo.id))
            .forEach((c: any) =>
                (c.actual_items || []).forEach((ai: any) => {
                    const k = String(ai.item_id);
                    actualByItem[k] = (actualByItem[k] || 0) + Number(ai.qty_used || 0);
                })
            );

        const rows = bomLines.map((line: any) => {
            const pct = parseFloat(line.percentage);
            const required = woQty > 0
                ? (pct > 0 ? (woQty * pct) / 100 : woQty * parseFloat(line.qty || 0))
                : null;
            const actual = actualByItem[String(line.item_id)];
            return {
                _key: line.id,
                item_code: line.item_code || '',
                item_name: line.item_name || line.item_id,
                // Composite cell: mono code then name, as the old card rendered it.
                item: { code: line.item_code || '', name: line.item_name || line.item_id },
                required_qty: required,
                actual_qty: actual ?? null,
                variance: required != null && actual != null ? actual - required : null,
                percentage: Number.isNaN(pct) ? null : pct,
            };
        });

        return {
            rows,
            autoTitle: usedAllLines ? 'Material (berdasarkan BOM)' : 'Komponen Operasi Ini',
        };
    },
};

export const ROW_SOURCES: Record<string, RowSourceDef> = {
    [BOM_STEP_LINES.id]: BOM_STEP_LINES,
};

export function rowSource(id: string): RowSourceDef | undefined {
    return ROW_SOURCES[id];
}
