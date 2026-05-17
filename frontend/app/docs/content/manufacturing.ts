import { DocPage } from '../docsContent';

export const manufacturingPage: DocPage = {
    slug: 'manufacturing',
    title: 'Manufacturing',
    subtitle: 'Plan, execute, and track production with Manufacturing Orders, Work Orders, and Production Runs.',
    badges: ['Manufacturing Orders', 'Work Orders', 'Production Runs', 'Variant Consolidation', 'MES', 'Target vs Actual'],
    sections: [
        {
            heading: 'Three-Tier Production Model',
            body: 'Every production campaign in Teras ERP follows a three-tier hierarchy:',
            steps: [
                'Production Run — the top-level planning container. Groups one or more BOMs and their Manufacturing Orders into a single scheduled batch. Provides a consolidated material requirements view across all orders in the run.',
                'Manufacturing Order (MO) — one production job for a specific finished good and quantity. Linked to a BOM. Carries status, timestamps, and material availability checks. An MO cannot start until all its upstream component MOs are complete.',
                'Work Order (WO) — a single routing step within an MO (e.g. "Weave", "Dye", "QC"). Tracks operator, planned vs. actual duration, and operation-level status. Work Orders do not move stock — stock movement happens at MO completion.',
            ],
        },
        {
            heading: 'Multi-BOM Production Runs',
            body: 'A Production Run accepts multiple BOM entries — one per product variant or colour. This allows size variants and colour variants to be planned and consolidated in a single batch.',
            callout: {
                type: 'info',
                text: 'When two or more BOMs in a run share the same sub-assembly (e.g. the same greige/base item), the system merges their requirements into a single consolidated component Manufacturing Order. Operators prepare the base material once for the entire batch.',
            },
        },
        {
            heading: 'Two-Pass Consolidation Algorithm',
            body: 'When a Production Run is created, the system runs two passes:',
            steps: [
                'Pass 1 — Create root MOs. For each BOM entry, one root Manufacturing Order is created per size (if the BOM has sizes defined) or a single MO for the total quantity. These are the finishing orders — one per product variant/size combination.',
                'Pass 2 — Consolidate sub-assemblies. The system walks all BOM lines across all entries and groups sub-assembly demand by the key (sub-component item + sub-BOM + source location). Where two or more root MOs share the same sub-assembly BOM, their quantities are summed into one consolidated component MO. MODependency records are written to track each root MO\'s contribution.',
            ],
            callout: {
                type: 'tip',
                text: 'Consolidated component MOs are marked as shared. A root MO cannot be started until all its shared component MOs reach Completed status — enforcing the correct material flow sequence.',
            },
        },
        {
            heading: 'Case 1 — Size Variants with Shared Sub-Assembly',
            body: 'Item-A is produced in sizes XL (100 units) and L (80 units). Both sizes use the same Item-B sub-assembly at 20% of output. Item-B is in turn made from Item-C and Item-D.',
            code:
`BOM-A  (single BOM, sizes: XL and L)
  └─ Item-B  20%  →  BOM-B
                        ├─ Item-C  50%
                        └─ Item-D  50%`,
            table: {
                headers: ['Root MO', 'Qty', 'Item-B demand (20%)', 'Item-C demand', 'Item-D demand'],
                rows: [
                    ['MO-A-XL', '100', '20',  '10', '10'],
                    ['MO-A-L',  '80',  '16',  '8',  '8'],
                    ['**Consolidated**', '—', '**36**', '**18**', '**18**'],
                ],
            },
            body: 'Result: one consolidated MO for Item-B (qty 36) instead of two separate orders. Operators prepare Item-B once. The XL and L finishing orders can only start after the shared Item-B MO is complete.',
        },
        {
            heading: 'Case 2 — Colour Variants via Dyeing',
            body: 'Item-A is a base fabric with one BOM and no colour attribute. Colour variants (e.g. Black-218, Red-X) are produced by running Item-A through the Dyeing & Setting process with the matching dye recipe. They are not separate BOMs — they are the same item with a colour attribute value applied.',
            callout: {
                type: 'info',
                text: 'When creating a Production Run for multiple colours, add one BOM entry per colour. Each entry uses the same base BOM. Set the Colour selector on each entry to the target colour (e.g. Black-218). The system creates one root MO per colour entry, all using the same base BOM. Sub-assembly demand is consolidated in Pass 2 — base material is prepared once for the whole batch. Each root MO carries the colour attribute so stock credits correctly to Item-A [Black-218] and Item-A [Red-X] separately.',
            },
            table: {
                headers: ['PR Entry', 'BOM', 'Colour attr', 'Root MO produced'],
                rows: [
                    ['Entry 1', 'BOM-Item-A', 'Black-218', 'Item-A [Black-218]'],
                    ['Entry 2', 'BOM-Item-A', 'Red-X',     'Item-A [Red-X]'],
                    ['Consolidated', 'BOM-Item-A sub-components', '—', 'Shared component MO'],
                ],
            },
        },
        {
            heading: 'Material Requirements View',
            body: 'Expanding a Production Run row reveals a live material requirements panel. This aggregates component demand across all Manufacturing Orders in the run, compares totals against current stock, and highlights shortfalls. A per-MO breakdown shows each order\'s contribution to every line.',
        },
        {
            heading: 'MO Status Flow',
            body: 'Manufacturing Orders follow a strict status progression:',
            steps: [
                'PENDING — MO created, not yet started. Material availability is checked on every list load.',
                'IN_PROGRESS — Production has started. All upstream shared component MOs must be COMPLETED before this transition is allowed. Stock is checked at this point; insufficient material blocks the transition.',
                'COMPLETED — Output posted to stock. Raw material components deducted from source location. Finished goods credited to output location. Linked Sales Order is set to READY if applicable.',
                'CANCELLED — No stock movement. MO withdrawn before completion.',
            ],
        },
        {
            heading: 'Incremental Completion',
            body: 'Manufacturing Orders support incremental completion — operators log partial output quantities without closing the MO. Each completion entry immediately deducts raw material components proportionally from stock and credits finished goods output. The MO auto-completes when cumulative logged output reaches the ordered quantity.',
        },
        {
            heading: 'Dual-Track Timestamps',
            body: 'Every Manufacturing Order and Work Order records four timestamps:',
            table: {
                headers: ['Field', 'Set by', 'Purpose'],
                rows: [
                    ['Target Start', 'Planner at creation', 'Planned production start date'],
                    ['Target End',   'Planner at creation', 'Planned production completion date'],
                    ['Actual Start', 'System on IN_PROGRESS', 'Real production start timestamp'],
                    ['Actual End',   'System on COMPLETED',   'Real completion timestamp'],
                ],
            },
        },
        {
            heading: 'Shop Floor QR Terminal',
            body: 'The /scanner page provides a mobile-optimised operator interface. Each printed MO includes a QR code. Scanning a PENDING MO starts it. Scanning an IN_PROGRESS MO opens the completion entry form. Status changes broadcast to all connected users via WebSocket.',
        },
        {
            heading: 'Key Actions',
            items: [
                'Create Manufacturing Orders manually or from Sales Order lines',
                'Create Production Runs with multiple BOM entries to batch colour and size variants together',
                'Shared sub-assemblies are automatically consolidated into one component MO per unique sub-BOM',
                'View aggregated material requirements per Production Run with per-MO contribution breakdown',
                'Log incremental completions to record partial output and trigger proportional material deductions',
                'Track MO status through PENDING → IN_PROGRESS → COMPLETED with upstream dependency enforcement',
                'Monitor target vs. actual timestamps to measure schedule variance',
                'Scan QR codes at the shop floor terminal to update MO status from mobile devices',
                'Print individual MO and WO sheets with QR codes, component lists, and routing steps',
            ],
        },
    ],
};
