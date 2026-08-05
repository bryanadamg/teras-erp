// Single source of truth for how the Permissions settings page renders the
// resource x action grid. Mirrors the Permissions config spreadsheet layout —
// section groupings and row order match it so the settings page reads the same
// way the spreadsheet did. Permission codes here (`${resource}.${action.code}`)
// must match the backend taxonomy seeded in init_db.py / the granular
// permission migration (2afd23590ae8_granular_permission_taxonomy.py).

export interface PermissionMatrixAction {
    code: string;
    label: string;
}

export type PermissionScope = 'category' | 'location' | 'work_center_type';

export interface PermissionMatrixResource {
    resource: string;
    label: string;
    scope?: PermissionScope;
}

export interface PermissionMatrixSection {
    section: string;
    resources: PermissionMatrixResource[];
}

const A = (code: string, label: string): PermissionMatrixAction => ({ code, label });

export const CREATE = A('create', 'Create');
export const EDIT = A('edit', 'Edit');
export const DELETE = A('delete', 'Delete');
export const VIEW = A('view', 'View only');

export const PERMISSION_MATRIX: PermissionMatrixSection[] = [
    {
        section: 'Sales & Purchase',
        resources: [
            { resource: 'sales_order', label: 'Sales Order' },
            { resource: 'customer', label: 'Customer' },
            { resource: 'supplier', label: 'Supplier' },
            { resource: 'sample_request', label: 'Sample Request' },
            { resource: 'purchase_order', label: 'Purchase Order' },
        ],
    },
    {
        section: 'Item Inventory',
        resources: [
            { resource: 'item', label: 'Per Categories', scope: 'category' },
            { resource: 'attribute', label: 'Attribute' },
            { resource: 'category', label: 'Categorie' },
            { resource: 'uom', label: 'Unit Of Measure' },
            { resource: 'combo_library', label: 'Combo Library' },
        ],
    },
    {
        section: 'Stock',
        resources: [
            { resource: 'lot', label: 'Lot Management', scope: 'location' },
            { resource: 'stock_on_hand', label: 'Stock In Hand', scope: 'category' },
            { resource: 'booking_stock', label: 'Booking Stock' },
            { resource: 'location', label: 'Location' },
            { resource: 'stock_ledger', label: 'Stock Ledger' },
        ],
    },
    {
        section: 'Manufacturing',
        resources: [
            { resource: 'bom', label: 'Bill of Material' },
            { resource: 'routing', label: 'Routing and Ops' },
            { resource: 'production_run', label: 'Production Run' },
            { resource: 'manufacturing_order', label: 'Manufacture Order' },
            { resource: 'work_order', label: 'Work Order', scope: 'work_center_type' },
            { resource: 'weaving_monitor', label: 'Weaving Monitor' },
            { resource: 'calendar', label: 'Calender' },
            { resource: 'beam', label: 'Beam' },
        ],
    },
    {
        section: 'Dyeing & Setting',
        resources: [
            { resource: 'dye_recipe', label: 'Dye Recipe' },
            { resource: 'dye_order', label: 'Dye Order' },
            { resource: 'setting_order', label: 'Setting Order' },
            { resource: 'color_code', label: 'Color Code' },
            { resource: 'color_variant', label: 'Color Variant' },
            { resource: 'lab_dip_request', label: 'Lab Dip Request' },
            { resource: 'yarn_lab_dip', label: 'Yarn Lab Dip' },
        ],
    },
    {
        section: 'Platform',
        resources: [
            { resource: 'audit_log', label: 'Audit Log' },
            { resource: 'print_layout', label: 'Print Lay Out' },
            { resource: 'system_admin', label: 'System Admin' },
        ],
    },
];

// Per-resource action lists (order matches the spreadsheet's column order for
// that row). Resources not listed here fall back to CREATE/EDIT/DELETE/VIEW.
export const RESOURCE_ACTIONS: Record<string, PermissionMatrixAction[]> = {
    sales_order: [CREATE, EDIT, DELETE, A('create_pr', 'Create PR'), A('print', 'Print'), VIEW, A('close', 'Closed SO')],
    customer: [A('create', 'Add'), EDIT, DELETE, VIEW],
    supplier: [A('create', 'Add'), EDIT, DELETE, VIEW],
    sample_request: [CREATE, EDIT, DELETE, A('update_status', 'Update Status'), A('print', 'Print'), VIEW],
    purchase_order: [CREATE, EDIT, DELETE, A('receive_goods', 'Received Good'), A('print', 'Print'), VIEW, A('close', 'Closed PO')],

    item: [CREATE, EDIT, DELETE, A('import', 'Import'), VIEW],
    attribute: [CREATE, EDIT, DELETE, VIEW],
    category: [CREATE, EDIT, DELETE, VIEW],
    uom: [CREATE, EDIT, DELETE, VIEW],
    combo_library: [CREATE, EDIT, DELETE, VIEW],

    lot: [CREATE, A('split', 'Split'), DELETE, A('qc_reject', 'QC Reject'), VIEW],
    stock_on_hand: [CREATE, A('adjust', 'Adjust'), A('move', 'Move'), VIEW],
    booking_stock: [VIEW],
    location: [CREATE, EDIT, DELETE, VIEW],
    stock_ledger: [A('print', 'Print'), VIEW],

    bom: [CREATE, EDIT, DELETE, VIEW],
    routing: [CREATE, EDIT, DELETE, VIEW],
    production_run: [CREATE, EDIT, DELETE, A('print', 'Print'), VIEW],
    manufacturing_order: [CREATE, EDIT, DELETE, A('print', 'Print'), VIEW, A('close', 'Closed Order')],
    work_order: [A('log', 'Log'), EDIT, DELETE, A('print_card', 'Print Kartu Kerja'), VIEW, A('print_label', 'Print Label'), A('stage', 'Stage')],
    weaving_monitor: [A('start', 'Start'), A('stop', 'Stop'), VIEW],
    calendar: [EDIT, VIEW],
    beam: [A('unmount', 'Unmount'), VIEW],

    dye_recipe: [CREATE, EDIT, DELETE, A('print', 'Print'), VIEW],
    dye_order: [VIEW],
    setting_order: [VIEW],
    color_code: [CREATE, EDIT, A('archive', 'Archive'), A('create_recipe', 'Create Dyeing Recipe'), VIEW],
    color_variant: [CREATE, EDIT, DELETE],
    lab_dip_request: [CREATE, EDIT, DELETE, A('update_status', 'Update Status'), A('print', 'Print'), VIEW],
    yarn_lab_dip: [VIEW],

    audit_log: [VIEW],
    print_layout: [EDIT],
    system_admin: [CREATE, A('edit', 'edit'), DELETE],
};

export function permissionCode(resource: string, actionCode: string): string {
    return `${resource}.${actionCode}`;
}

// Resource (permission code prefix) -> section label, for regrouping a flat
// permission list the same way the matrix organizes it.
const RESOURCE_SECTION: Map<string, string> = new Map(
    PERMISSION_MATRIX.flatMap(sec => sec.resources.map(r => [r.resource, sec.section] as const))
);

/** Buckets a flat permission list into PERMISSION_MATRIX section order (unmatched codes fall into "Other"). */
export function groupPermissionsBySection<T extends { code: string }>(permissions: T[]): { section: string; permissions: T[] }[] {
    const bySection = new Map<string, T[]>();
    for (const p of permissions) {
        const section = RESOURCE_SECTION.get(p.code.split('.')[0]) || 'Other';
        if (!bySection.has(section)) bySection.set(section, []);
        bySection.get(section)!.push(p);
    }
    const order = [...PERMISSION_MATRIX.map(s => s.section), 'Other'];
    return order
        .filter(s => bySection.has(s))
        .map(s => ({ section: s, permissions: bySection.get(s)! }));
}
