import { DocPage } from '../docsContent';

export const overviewPage: DocPage = {
    slug: 'overview',
    title: 'Teras ERP — System Overview',
    subtitle: 'A complete manufacturing and inventory management system for factory operations.',
    badges: ['Inventory', 'Manufacturing', 'BOM', 'Dyeing', 'Sales', 'Purchase', 'Traceability', 'Reports'],
    sections: [
        {
            heading: 'What is Teras ERP?',
            body: 'Teras ERP is a full-stack Enterprise Resource Planning system purpose-built for textile manufacturing businesses. It connects every stage of your operation — from raw material procurement through multi-level production, dyeing, and lot-traced output to finished goods delivery — in a single, integrated platform.',
        },
        {
            heading: 'Core Capabilities',
            items: [
                'Real-time inventory tracking across multiple warehouse locations with O(1) stock lookups',
                'Three-tier production planning — Production Run → Manufacturing Order → Work Order — with MES-level shop-floor tracking',
                'Recursive Bill of Materials (BOM) supporting nested assemblies, percentage-based quantities, routing, and tolerance controls',
                'Variant BOM support — colour variants share a common greige/base BOM; only variant-specific components differ',
                'Multi-BOM Production Runs — batch size and colour variants together; shared sub-assemblies are automatically consolidated into a single preparation order',
                'Beaming workflow with warp beams tracked as stock lots from beaming through weaving',
                'Full lot tracking with auto-created output lots, supplier lots, lot-aware transfers, and backward genealogy tracing',
                'Packaging-unit tallies (cones / boxes / drums) tracked alongside base quantity',
                'Dyeing & Setting wet-processing — dye recipes, Kartu Celup printouts, dyeing/setting runs, and lab dip colour approval',
                'Sales and Purchase order lifecycle management, goods receipts with supplier delivery notes, and print-ready A4 templates',
                'Sales-Order-to-beam lineage tracing across the whole production chain',
                'PLM Sample Request workflow for new product development with design file attachments',
                'Live KPI dashboard and Smart Advisor with WebSocket-powered real-time updates',
                'Role-based access control (RBAC) with granular per-user category restrictions',
                'Full audit trail with immutable change logs and JSON field diffs',
            ],
        },
        {
            heading: 'Technology',
            body: 'The backend runs on FastAPI (Python 3.11+) with PostgreSQL 15 and Redis 7; schema changes are managed with Alembic migrations. The frontend is built with Next.js 14 and React 18. Real-time events are broadcast via Redis pub/sub and WebSockets. All services ship as Docker containers.',
        },
        {
            heading: 'Module Map',
            items: [
                'Inventory — Items, Attributes, Variants, Categories, UOM, Lot Tracking',
                'Stock — Locations, Location Categories, Stock Balances, Lots, Packaging Units, Ledger, Scanner Terminal',
                'BOM Designer — Recursive BOMs, Routing, Percentage Quantities, Variant BOMs, Automator',
                'Manufacturing — Production Runs, Manufacturing Orders, Work Orders, Beaming, Consolidation',
                'Sales — Sales Orders, Customer Management, Produce-to-Order, Lineage',
                'Purchase — Purchase Orders, Supplier Management, Goods Receipt, Delivery Notes',
                'Dyeing & Setting — Lab Dips, Dye Recipes, Dyeing Runs, Setting Runs',
                'Samples & PLM — Sample Masters, Sample Requests, Approval Workflow',
                'Dashboard & Reports — KPIs, Smart Advisor, Analytics',
                'Administration — Settings, Users, Roles, Audit Logs',
            ],
        },
    ],
};
