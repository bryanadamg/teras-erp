// Single source of truth for the app's navigation taxonomy.
// Consumed by:
//  - Sidebar.tsx         → section headers + nav items (permission-gated)
//  - MainLayout.tsx      → page titles for /sections/* routes + route-chunk prefetch
//  - SectionHomeView.tsx → section meta (label/icon/accent) + quick links
// Add a page here and every consumer picks it up — do not hand-edit their lists.

export interface NavLeaf {
    tab: string;          // route slug (also the activeTab key)
    label: string;        // English fallback label
    i18nKey?: string;     // LanguageContext key; label used when key missing
    icon: string;         // bootstrap-icons class
    permission?: string;  // leaf visible only with this permission
}

export interface NavSection {
    key: string;          // section slug → /sections/<key>
    label: string;
    i18nKey?: string;
    icon: string;
    accent: 'blue' | 'green' | 'amber' | 'grey';
    permissions?: string[]; // section visible if user has ANY of these (omit = public)
    items: NavLeaf[];
}

export const NAV_SECTIONS: NavSection[] = [
    {
        key: 'sales', label: 'Sales', i18nKey: 'sales', icon: 'bi-graph-up', accent: 'green',
        permissions: ['sales.manage'],
        items: [
            { tab: 'sales-orders', label: 'Sales Orders', i18nKey: 'sales_orders', icon: 'bi-file-text', permission: 'sales.manage' },
            { tab: 'packaging', label: 'Packaging', icon: 'bi-box2', permission: 'sales.manage' },
            { tab: 'customers', label: 'Customers', i18nKey: 'customers', icon: 'bi-people', permission: 'sales.manage' },
            { tab: 'samples', label: 'Sample Requests', i18nKey: 'sample_requests', icon: 'bi-flask', permission: 'sales.manage' },
        ],
    },
    {
        key: 'procurement', label: 'Procurement', i18nKey: 'procurement', icon: 'bi-cart3', accent: 'amber',
        permissions: ['purchasing.manage'],
        items: [
            { tab: 'purchase-orders', label: 'Purchase Orders', i18nKey: 'purchase_orders', icon: 'bi-bag', permission: 'purchasing.manage' },
            { tab: 'suppliers', label: 'Suppliers', i18nKey: 'suppliers', icon: 'bi-truck', permission: 'purchasing.manage' },
        ],
    },
    {
        key: 'inventory', label: 'Inventory', i18nKey: 'inventory', icon: 'bi-box-seam', accent: 'blue',
        permissions: ['inventory.manage', 'locations.manage'],
        items: [
            { tab: 'inventory', label: 'Item Inventory', i18nKey: 'item_inventory', icon: 'bi-list-check', permission: 'inventory.manage' },
            { tab: 'item-metadata', label: 'Attributes', i18nKey: 'attributes', icon: 'bi-tag', permission: 'inventory.manage' },
            { tab: 'combos', label: 'Combo Library', icon: 'bi-grid-3x3-gap', permission: 'inventory.manage' },
            { tab: 'batches', label: 'Lot', icon: 'bi-upc-scan', permission: 'inventory.manage' },
            // Stock entry/transfer/adjust duties were merged into Stock On-Hand
            // (commit e6f38da) — /stock (StockEntryView) is desktop-deprecated.
            // Its mobile branch (bottom-tab "Stock") is a separate, still-live
            // read-only browse view — don't add a desktop nav leaf here.
            { tab: 'stock-on-hand', label: 'Stock On-Hand', i18nKey: 'stock_on_hand', icon: 'bi-boxes', permission: 'inventory.manage' },
            { tab: 'booking-stock', label: 'Booking Stock', i18nKey: 'booking_stock', icon: 'bi-bookmark-check', permission: 'inventory.manage' },
            { tab: 'locations', label: 'Locations', i18nKey: 'locations', icon: 'bi-geo-alt', permission: 'locations.manage' },
        ],
    },
    {
        key: 'engineering', label: 'Engineering', i18nKey: 'engineering', icon: 'bi-gear', accent: 'blue',
        permissions: ['manufacturing.manage', 'work_order.manage'],
        items: [
            { tab: 'bom', label: 'BOM', i18nKey: 'bom', icon: 'bi-diagram-3', permission: 'manufacturing.manage' },
            { tab: 'routing', label: 'Routing', i18nKey: 'routing', icon: 'bi-shuffle', permission: 'manufacturing.manage' },
            { tab: 'production-runs', label: 'Production Runs', icon: 'bi-collection-play', permission: 'work_order.manage' },
            { tab: 'manufacturing-orders', label: 'Manufacturing Orders', i18nKey: 'manufacturing_orders', icon: 'bi-list-task', permission: 'work_order.manage' },
            { tab: 'work-orders', label: 'Work Orders', i18nKey: 'work_orders', icon: 'bi-tools', permission: 'work_order.manage' },
            { tab: 'weaving-monitor', label: 'Weaving Monitor', i18nKey: 'weaving_monitor', icon: 'bi-speedometer2', permission: 'work_order.manage' },
        ],
    },
    {
        key: 'dyeing', label: 'Dyeing & Setting', icon: 'bi-droplet-half', accent: 'blue',
        permissions: ['dyeing.manage'],
        items: [
            { tab: 'dyeing-setting', label: 'Dyeing & Setting', icon: 'bi-palette', permission: 'dyeing.manage' },
            { tab: 'colors', label: 'Colors', icon: 'bi-palette2', permission: 'dyeing.manage' },
            { tab: 'lab-dips', label: 'Lab Dip Requests', icon: 'bi-droplet', permission: 'dyeing.manage' },
            { tab: 'lab-dips-yarn', label: 'Yarn Lab Dips', icon: 'bi-droplet-half', permission: 'dyeing.manage' },
        ],
    },
    {
        key: 'reports', label: 'Reports', i18nKey: 'reports', icon: 'bi-bar-chart', accent: 'grey',
        permissions: ['reports.view'],
        items: [
            { tab: 'reports', label: 'Stock Ledger', i18nKey: 'stock_ledger', icon: 'bi-journal-text' },
            { tab: 'audit-logs', label: 'Audit Logs', icon: 'bi-clipboard-check', permission: 'admin.access' },
        ],
    },
    {
        key: 'administration', label: 'Administration', i18nKey: 'administration', icon: 'bi-sliders', accent: 'grey',
        permissions: ['admin.access'],
        items: [
            { tab: 'print-designer', label: 'Print Layouts', i18nKey: 'print_designer', icon: 'bi-printer', permission: 'admin.access' },
        ],
    },
];

/** Resolve a nav entry's display label: i18n when the key exists, else the English fallback. */
export const navLabel = (t: (k: string) => string, entry: { label: string; i18nKey?: string }) =>
    entry.i18nKey && t(entry.i18nKey) !== entry.i18nKey ? t(entry.i18nKey) : entry.label;

/** Section-home page titles, keyed by section slug. */
export const SECTION_LABELS: Record<string, string> = Object.fromEntries(
    NAV_SECTIONS.map(s => [s.key, s.label])
);

/** Every route worth warming after login: sidebar destinations + section homes. */
export const PREFETCH_ROUTES: string[] = [
    '/dashboard', '/scanner', '/settings',
    ...NAV_SECTIONS.flatMap(s => s.items.map(i => `/${i.tab}`)),
    ...NAV_SECTIONS.map(s => `/sections/${s.key}`),
];
