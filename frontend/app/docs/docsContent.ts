// ─── Types ───────────────────────────────────────────────────────────────────

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
    body?: string;
    items?: string[];
    steps?: string[];
    code?: string;
    table?: { headers: string[]; rows: string[][] };
    callout?: { type: 'info' | 'tip' | 'warning'; text: string };
    columns?: { label: string; items: string[] }[];
}

// ─── Sidebar Navigation ───────────────────────────────────────────────────────

export const docsSidebar: DocSection[] = [
    {
        title: 'Getting Started',
        items: [
            { slug: 'overview', label: 'Overview', icon: 'bi-house-door' },
            { slug: 'quick-start', label: 'Quick Start', icon: 'bi-lightning' },
        ],
    },
    {
        title: 'Modules',
        items: [
            { slug: 'inventory', label: 'Inventory & Items', icon: 'bi-box-seam' },
            { slug: 'stock', label: 'Stock & Locations', icon: 'bi-boxes' },
            { slug: 'bom', label: 'BOM Designer', icon: 'bi-diagram-3' },
            { slug: 'manufacturing', label: 'Manufacturing', icon: 'bi-gear' },
            { slug: 'sales-orders', label: 'Sales Orders', icon: 'bi-cart3' },
            { slug: 'purchase', label: 'Purchase Orders', icon: 'bi-truck' },
            { slug: 'samples', label: 'Samples & PLM', icon: 'bi-flask' },
            { slug: 'dyeing-setting', label: 'Dyeing & Setting', icon: 'bi-palette' },
            { slug: 'reports', label: 'Reports & Dashboard', icon: 'bi-graph-up' },
        ],
    },
    {
        title: 'Administration',
        items: [
            { slug: 'settings', label: 'Settings', icon: 'bi-sliders' },
            { slug: 'users', label: 'User Management', icon: 'bi-people' },
            { slug: 'audit-logs', label: 'Audit Logs', icon: 'bi-clipboard-check' },
        ],
    },
];

// ─── Page Content (imported from individual section files) ───────────────────

import { overviewPage } from './content/overview';
import { quickStartPage } from './content/quick-start';
import { inventoryPage } from './content/inventory';
import { stockPage } from './content/stock';
import { bomPage } from './content/bom';
import { manufacturingPage } from './content/manufacturing';
import { salesOrdersPage } from './content/sales-orders';
import { purchasePage } from './content/purchase';
import { samplesPage } from './content/samples';
import { dyeingSettingPage } from './content/dyeing-setting';
import { reportsPage } from './content/reports';
import { settingsPage } from './content/settings';
import { usersPage } from './content/users';
import { auditLogsPage } from './content/audit-logs';

export const docsPages: Record<string, DocPage> = {
    overview: overviewPage,
    'quick-start': quickStartPage,
    inventory: inventoryPage,
    stock: stockPage,
    bom: bomPage,
    manufacturing: manufacturingPage,
    'sales-orders': salesOrdersPage,
    purchase: purchasePage,
    samples: samplesPage,
    'dyeing-setting': dyeingSettingPage,
    reports: reportsPage,
    settings: settingsPage,
    users: usersPage,
    'audit-logs': auditLogsPage,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getPageBySlug(slug: string): DocPage | null {
    return docsPages[slug] ?? null;
}

export function getAllSlugs(): string[] {
    return Object.keys(docsPages);
}
