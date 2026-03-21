export interface DocSection {
    title: string;
    items: DocItem[];
}

export interface DocItem {
    slug: string;
    label: string;
    icon: string;
}

export interface DocPage {
    slug: string;
    title: string;
    subtitle: string;
    badges?: string[];
    sections: DocPageSection[];
}

export interface DocPageSection {
    heading: string;
    body: string; // plain text / simple markdown-like
    items?: string[]; // bullet list
}

export const docsSidebar: DocSection[] = [
    {
        title: 'Getting Started',
        items: [
            { slug: 'overview', label: 'Overview', icon: '🏠' },
            { slug: 'quick-start', label: 'Quick Start', icon: '⚡' },
        ],
    },
    {
        title: 'Modules',
        items: [
            { slug: 'inventory', label: 'Inventory & Items', icon: '📦' },
            { slug: 'stock', label: 'Stock & Locations', icon: '🗄️' },
            { slug: 'bom', label: 'BOM Designer', icon: '🔩' },
            { slug: 'manufacturing', label: 'Manufacturing', icon: '🏭' },
            { slug: 'sales-orders', label: 'Sales Orders', icon: '🛒' },
            { slug: 'purchase', label: 'Purchase Orders', icon: '🚚' },
            { slug: 'samples', label: 'Samples & PLM', icon: '🧪' },
            { slug: 'reports', label: 'Reports & Dashboard', icon: '📈' },
        ],
    },
    {
        title: 'Administration',
        items: [
            { slug: 'settings', label: 'Settings', icon: '⚙️' },
            { slug: 'users', label: 'User Management', icon: '👥' },
            { slug: 'audit-logs', label: 'Audit Logs', icon: '📋' },
        ],
    },
];

export const docsPages: Record<string, DocPage> = {
    overview: {
        slug: 'overview',
        title: 'Teras ERP — System Overview',
        subtitle: 'A complete manufacturing and inventory management system for factory operations.',
        badges: ['Inventory', 'Manufacturing', 'BOM', 'Sales', 'Purchase', 'Reports'],
        sections: [
            {
                heading: 'What is Teras ERP?',
                body: 'Teras ERP is a full-stack Enterprise Resource Planning system purpose-built for manufacturing businesses. It connects every stage of your operation — from raw material procurement to finished goods delivery — in a single, integrated platform.',
            },
            {
                heading: 'Core Capabilities',
                items: [
                    'Real-time inventory tracking across multiple warehouse locations',
                    'Work order management with MES-level production tracking',
                    'Recursive Bill of Materials supporting nested assemblies',
                    'Sales and purchase order lifecycle management',
                    'Sample and PLM request workflow for product development',
                    'Live KPI dashboard with WebSocket-powered real-time updates',
                    'Role-based access control with granular per-user permissions',
                ],
            },
            {
                heading: 'Technology',
                body: 'The backend runs on FastAPI (Python) with a PostgreSQL database. The frontend is built with Next.js 14 and React 18. Real-time events are broadcast via Redis pub/sub and WebSockets.',
            },
        ],
    },

    'quick-start': {
        slug: 'quick-start',
        title: 'Quick Start Guide',
        subtitle: 'Get up and running with Teras ERP in minutes.',
        sections: [
            {
                heading: '1. Log In',
                body: 'Navigate to the Teras ERP URL provided by your administrator. Enter your username and password on the Welcome Screen. After logging in, you will land on the Dashboard.',
            },
            {
                heading: '2. Set Up Locations',
                body: 'Before tracking stock, define your warehouse locations under Stock → Locations. Each location represents a physical area (e.g. "Main Warehouse", "Dispatch Bay").',
            },
            {
                heading: '3. Create Items',
                body: 'Go to Inventory → Items to define your products, raw materials, and components. Assign categories, units of measure, and attributes as needed.',
            },
            {
                heading: '4. Add Initial Stock',
                body: 'Use Stock → Scanner or create stock entries to record your opening balances. Stock balances are updated in real-time as transactions occur.',
            },
            {
                heading: '5. Build a BOM',
                body: 'Navigate to BOM Designer to define the Bill of Materials for your manufactured products. Specify components, quantities, and production routing steps.',
            },
            {
                heading: '6. Create a Work Order',
                body: 'Go to Manufacturing → Work Orders to plan a production run. Link a BOM, set target quantities and dates, then track progress through the MES interface.',
            },
        ],
    },

    inventory: {
        slug: 'inventory',
        title: 'Inventory & Items',
        subtitle: 'Manage your product catalogue — items, variants, attributes, categories, and units of measure.',
        badges: ['Items', 'Variants', 'Attributes', 'Categories', 'UOM'],
        sections: [
            {
                heading: 'Items',
                body: 'An Item is any product, raw material, or component tracked by the system. Each item has a unique code, description, category, and unit of measure. Items can have variants (e.g. colour, size) defined through attributes.',
            },
            {
                heading: 'Variants & Attributes',
                body: 'Attributes define the dimensions of variation for an item (e.g. "Colour", "Size"). Variants are the specific combinations (e.g. "Red / Large"). Stock is tracked per variant, not just per item.',
            },
            {
                heading: 'Categories',
                body: 'Categories group items for reporting and access control. Administrators can restrict users to specific categories — useful for separating raw materials from finished goods teams.',
            },
            {
                heading: 'Units of Measure (UOM)',
                body: 'Every item is assigned a UOM (e.g. kg, metres, units, litres). UOM is used consistently across BOM quantities, stock entries, and purchase/sales orders.',
            },
            {
                heading: 'Key Actions',
                items: [
                    'Create / edit / deactivate items',
                    'Define attributes and generate variant combinations',
                    'Assign categories and UOM',
                    'View current stock balance per item from the item detail page',
                ],
            },
        ],
    },

    stock: {
        slug: 'stock',
        title: 'Stock & Locations',
        subtitle: 'Track physical inventory across warehouse locations with a full transaction ledger.',
        badges: ['Locations', 'Stock Balances', 'Ledger', 'Scanner'],
        sections: [
            {
                heading: 'Locations',
                body: 'Locations represent physical storage areas within your facility. You can define as many locations as needed. Stock balances are maintained per item-variant-location combination.',
            },
            {
                heading: 'Stock Balances',
                body: 'Balances are materialised (pre-calculated) for instant O(1) lookups — there is no need to sum ledger entries on every query. Balances update atomically when stock entries are created.',
            },
            {
                heading: 'Stock Ledger',
                body: 'Every stock movement creates an immutable ledger entry. This provides a complete audit trail of all inventory changes — receipts, issues, adjustments, and transfers.',
            },
            {
                heading: 'Scanner Interface',
                body: 'The /scanner page is optimised for barcode scanner workflows. Operators can quickly record stock movements by scanning item barcodes and entering quantities without navigating the full UI.',
            },
            {
                heading: 'Key Actions',
                items: [
                    'Create and manage warehouse locations',
                    'Record stock receipts, issues, and adjustments',
                    'Transfer stock between locations',
                    'View current balance per item/location',
                    'Browse full ledger history with filtering',
                ],
            },
        ],
    },

    bom: {
        slug: 'bom',
        title: 'BOM Designer',
        subtitle: 'Build recursive, multi-level Bills of Materials for any manufactured product.',
        badges: ['Recursive BOM', 'Assemblies', 'Routing', 'Percentage Qty'],
        sections: [
            {
                heading: 'What is a BOM?',
                body: 'A Bill of Materials (BOM) defines the components and sub-assemblies required to manufacture a finished product. Teras ERP supports recursive BOMs — a component can itself have a BOM, enabling multi-level assembly trees.',
            },
            {
                heading: 'Percentage-Based Quantities',
                body: 'Component quantities can be expressed as percentages of the parent item\'s quantity. This is useful for recipes where the input ratios are fixed regardless of batch size.',
            },
            {
                heading: 'Routing',
                body: 'Each BOM can include a routing — an ordered list of manufacturing operations (e.g. "Cut", "Sew", "Pack"). Routing steps are referenced by work orders for MES tracking.',
            },
            {
                heading: 'BOM Designer Interface',
                body: 'The drag-and-drop BOM Designer allows you to visually construct assembly trees, add components, set quantities, and define routing steps in one screen.',
            },
            {
                heading: 'Key Actions',
                items: [
                    'Create and version BOMs for finished goods',
                    'Add components with fixed or percentage quantities',
                    'Define nested sub-assemblies',
                    'Attach routing steps with operation details',
                    'Preview full material requirements for a production quantity',
                ],
            },
        ],
    },

    manufacturing: {
        slug: 'manufacturing',
        title: 'Manufacturing',
        subtitle: 'Plan, execute, and track production work orders with full MES-level visibility.',
        badges: ['Work Orders', 'MES', 'Routing', 'Target vs Actual'],
        sections: [
            {
                heading: 'Work Orders',
                body: 'A Work Order (WO) is the central document for a production run. It links a BOM, a target quantity, planned dates, and tracks progress through each routing step.',
            },
            {
                heading: 'Dual-Track Timestamps',
                body: 'Every work order records both target (planned) and actual (recorded) timestamps for start and completion. This enables variance analysis between planned and actual production performance.',
            },
            {
                heading: 'MES Interface',
                body: 'The Manufacturing Execution System view allows shop floor operators to record the start and completion of individual routing operations, log actual quantities, and flag quality issues.',
            },
            {
                heading: 'Work Order Statuses',
                items: [
                    'Draft — created but not yet released to the floor',
                    'Released — ready for production',
                    'In Progress — at least one operation has started',
                    'Completed — all operations finished, output recorded',
                    'Cancelled — withdrawn before completion',
                ],
            },
            {
                heading: 'Material Consumption',
                body: 'When a work order is completed, component quantities are automatically deducted from stock based on the BOM. Output items are added to the designated finished goods location.',
            },
        ],
    },

    'sales-orders': {
        slug: 'sales-orders',
        title: 'Sales Orders',
        subtitle: 'Manage customer orders from creation through fulfilment.',
        badges: ['Customers', 'Orders', 'Line Items', 'Status Tracking'],
        sections: [
            {
                heading: 'Customers',
                body: 'Customers (also called Partners) are managed under the Customers section. Each customer has contact details, a default currency, and an order history.',
            },
            {
                heading: 'Creating a Sales Order',
                body: 'A sales order captures what a customer wants to buy, in what quantities, at what price, and by when. Line items reference items from the inventory catalogue.',
            },
            {
                heading: 'Order Statuses',
                items: [
                    'Draft — being prepared',
                    'Confirmed — accepted by both parties',
                    'Partially Fulfilled — some lines shipped',
                    'Fulfilled — all lines shipped',
                    'Cancelled — withdrawn',
                ],
            },
            {
                heading: 'Key Actions',
                items: [
                    'Create and manage customer records',
                    'Raise sales orders with multiple line items',
                    'Track fulfilment status per order and per line',
                    'Print or export order documents',
                ],
            },
        ],
    },

    purchase: {
        slug: 'purchase',
        title: 'Purchase Orders',
        subtitle: 'Manage supplier orders and goods receipts to replenish inventory.',
        badges: ['Suppliers', 'PO', 'Goods Receipt', 'Status Tracking'],
        sections: [
            {
                heading: 'Suppliers',
                body: 'Suppliers are managed under the Suppliers section. Like customers, they are Partner records with contact information and order history.',
            },
            {
                heading: 'Creating a Purchase Order',
                body: 'A purchase order is raised to a supplier for specific items and quantities. Line items reference the inventory catalogue so receipts automatically update stock balances.',
            },
            {
                heading: 'Goods Receipt',
                body: 'When goods arrive, you record a receipt against the purchase order. This creates stock ledger entries and updates balances for the received items at the designated location.',
            },
            {
                heading: 'Order Statuses',
                items: [
                    'Draft — being prepared',
                    'Sent — issued to supplier',
                    'Partially Received — some lines received',
                    'Received — all lines received',
                    'Cancelled — withdrawn',
                ],
            },
        ],
    },

    samples: {
        slug: 'samples',
        title: 'Samples & PLM',
        subtitle: 'Manage sample requests and the product lifecycle workflow for new product development.',
        badges: ['Sample Requests', 'Sample Masters', 'PLM', 'Approval Workflow'],
        sections: [
            {
                heading: 'Sample Masters',
                body: 'A Sample Master defines a new product or variant under development. It contains the specification, target BOM, and development stage.',
            },
            {
                heading: 'Sample Requests',
                body: 'Sample Requests are raised to produce physical samples for customer evaluation or internal testing. Each request links to a Sample Master and tracks approval and production status.',
            },
            {
                heading: 'Workflow Stages',
                items: [
                    'Requested — sample production order raised',
                    'In Production — being manufactured',
                    'Ready — sample produced and available',
                    'Approved — signed off by reviewer',
                    'Rejected — failed evaluation, revision needed',
                ],
            },
        ],
    },

    reports: {
        slug: 'reports',
        title: 'Reports & Dashboard',
        subtitle: 'Real-time KPIs, production performance, and inventory analytics.',
        badges: ['KPIs', 'Live Data', 'Smart Advisor', 'WebSocket'],
        sections: [
            {
                heading: 'Dashboard',
                body: 'The Dashboard shows a real-time summary of your operation: active work orders, stock levels, sales order pipeline, and key performance indicators. Data updates live via WebSocket without needing a page refresh.',
            },
            {
                heading: 'KPIs',
                body: 'Key Performance Indicators are calculated server-side and include: on-time delivery rate, production efficiency (target vs actual), inventory turnover, and low-stock alerts.',
            },
            {
                heading: 'Smart Advisor',
                body: 'The Smart Advisor analyses current data and surfaces actionable recommendations — such as items approaching reorder level, work orders running behind schedule, or open purchase orders overdue for delivery.',
            },
            {
                heading: 'Reports',
                body: 'The Reports section provides pre-built tabular reports for stock movement history, production output, sales performance, and purchase history. Reports can be filtered by date range, location, item category, and more.',
            },
        ],
    },

    settings: {
        slug: 'settings',
        title: 'Settings',
        subtitle: 'Configure company profile, database connections, and application preferences.',
        badges: ['Company Profile', 'Database', 'UI Preferences'],
        sections: [
            {
                heading: 'Company Profile',
                body: 'Set your company name, logo, and contact details. These appear on printed documents such as work order printouts and order confirmations.',
            },
            {
                heading: 'Database Infrastructure',
                body: 'Teras ERP supports hot-swapping database connections without a restart. Administrators can configure and test alternate database URLs from the Settings panel.',
            },
            {
                heading: 'UI Preferences',
                body: 'The application name and visual style can be customised per-user and stored in local settings. The classic Windows XP visual style is the default.',
            },
        ],
    },

    users: {
        slug: 'users',
        title: 'User Management',
        subtitle: 'Create and manage user accounts, roles, and permissions.',
        badges: ['Users', 'Roles', 'Permissions', 'RBAC'],
        sections: [
            {
                heading: 'Users',
                body: 'Each person who accesses Teras ERP has a user account with a unique username. Administrators can create, edit, and deactivate user accounts from the Settings → Users screen.',
            },
            {
                heading: 'Roles',
                body: 'Roles are named collections of permissions (e.g. "Warehouse Operator", "Sales Manager", "Admin"). Assigning a role to a user grants all permissions in that role.',
            },
            {
                heading: 'Granular Permissions',
                body: 'Beyond roles, individual permissions can be granted directly to a user. This allows fine-grained access control without creating a new role for every edge case.',
            },
            {
                heading: 'Category Restrictions',
                body: 'Users can optionally be restricted to specific item categories. A user with category restrictions will only see items belonging to their allowed categories throughout the system.',
            },
            {
                heading: 'Permission Reference',
                items: [
                    'admin.access — full system access, bypasses all permission checks',
                    'inventory.view / inventory.edit — read and write access to items',
                    'stock.view / stock.edit — stock balances and ledger',
                    'manufacturing.view / manufacturing.edit — work orders and MES',
                    'sales.view / sales.edit — sales orders and customers',
                    'purchase.view / purchase.edit — purchase orders and suppliers',
                    'reports.view — dashboard and reports access',
                ],
            },
        ],
    },

    'audit-logs': {
        slug: 'audit-logs',
        title: 'Audit Logs',
        subtitle: 'A complete, tamper-evident record of all system activity.',
        badges: ['Audit Trail', 'Compliance', 'Change History'],
        sections: [
            {
                heading: 'What is Logged?',
                body: 'Every create, update, and delete operation performed by any user is recorded in the audit log. Entries capture the user, timestamp, affected record, and the before/after values.',
            },
            {
                heading: 'Viewing Audit Logs',
                body: 'Navigate to Audit Logs from the sidebar. Logs can be filtered by user, date range, and record type. Each entry expands to show the full change detail.',
            },
            {
                heading: 'Compliance',
                body: 'Audit logs are append-only and cannot be edited or deleted through the UI. This makes them suitable for compliance and accountability purposes in regulated manufacturing environments.',
            },
        ],
    },
};

export function getPageBySlug(slug: string): DocPage | null {
    return docsPages[slug] ?? null;
}

export function getAllSlugs(): string[] {
    return Object.keys(docsPages);
}
