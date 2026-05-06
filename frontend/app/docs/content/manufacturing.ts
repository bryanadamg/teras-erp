import { DocPage } from '../docsContent';

export const manufacturingPage: DocPage = {
    slug: 'manufacturing',
    title: 'Manufacturing',
    subtitle: 'Plan, execute, and track production with Manufacturing Orders, Work Orders, and Production Runs.',
    badges: ['Manufacturing Orders', 'Work Orders', 'Production Runs', 'MES', 'Variant Consolidation', 'Target vs Actual'],
    sections: [
        {
            heading: 'Manufacturing Orders (MO)',
            body: 'A Manufacturing Order (MO) is the top-level production document. It specifies what finished good to produce, in what quantity, and by when. MOs can be created manually or directly from a Sales Order line via the individual "Produce" button. An MO is linked to a BOM and optionally to a parent Sales Order.',
        },
        {
            heading: 'Work Orders (WO)',
            body: 'Work Orders are the operation-level documents under a Manufacturing Order. Each WO represents a single routing step or sub-assembly. While an MO tracks the overall production goal, WOs track the actual work happening on the shop floor — including operator assignment, material consumption, and output recording.',
        },
        {
            heading: 'Production Runs',
            body: 'A Production Run (PR) is a planning container that groups related Manufacturing Orders into a single scheduled campaign. A PR can span multiple BOMs — for example, a run that produces both the Black-218 and Red-X colour variants of the same product in one coordinated batch. The system automatically consolidates shared sub-component requirements across all the BOMs in a run, so operators receive a single aggregated preparation order rather than one per variant.',
        },
        {
            heading: 'Multi-BOM Production Runs — How Consolidation Works',
            body: 'When creating a Production Run, you can add multiple BOM entries — one per product variant or colour. The system runs a two-pass algorithm:\n\n1. Pass 1 — For each BOM entry, one root Manufacturing Order is created (per size if the BOM has sizes defined, or a single MO for the total quantity).\n\n2. Pass 2 — The system walks all BOM lines across all entries and groups sub-assembly demand by the unique key (sub-component item, sub-BOM, source location). Where two or more root MOs share the same sub-assembly BOM, their requirements are summed into a single consolidated component MO. MODependency records are written to track exactly how much each root MO contributed to that shared component MO.\n\nThe result is that operators see one consolidated preparation order per shared sub-component, not one per variant. The dependency chain ensures that a root MO cannot be started until its consolidated component MOs are complete.',
        },
        {
            heading: 'Case 1 — Size Variants with Shared Sub-Components',
            body: 'Consider Item-A available in sizes XL and L. Both sizes require Item-B (the same intermediate sub-assembly), which is in turn made from Item-C and Item-D. The proportion of Item-C and Item-D relative to Item-B is fixed, encoded as percentage quantities in Item-B\'s BOM.\n\nA Production Run with BOM-A (XL qty = 100, L qty = 80) produces:\n• MO-A-XL (qty 100) and MO-A-L (qty 80) as root orders\n• One consolidated MO for Item-B (qty = 100 × 20% + 80 × 20% = 36) shared by both root MOs\n• Item-C and Item-D requirements are calculated from the consolidated Item-B MO, not duplicated per size\n\nOperators prepare Item-B once for the full batch, then split output across sizes at the finishing stage.',
        },
        {
            heading: 'Case 2 — Colour Variants with Shared Greige',
            body: 'Consider Item-A in two colour variants: Black-218 and Red-X. Each variant has its own BOM (BOM-A-Black-218 and BOM-A-Red-X) tagged with the appropriate colour attribute values. Both BOMs share the same Item-B greige sub-assembly at 80% of output quantity. They differ only in the colorant line — Black-218 Dye at 5 m in one, Red-X Dye at 5 m in the other.\n\nA Production Run with both BOMs (Black-218 qty = 100, Red-X qty = 80) produces:\n• MO-A-Black-218 (qty 100) and MO-A-Red-X (qty 80) as root orders — each carries the correct colour attribute values for stock posting\n• One consolidated MO for Item-B (qty = 100 × 80% + 80 × 80% = 144) shared by both root MOs\n• Colorant lines are raw material inputs consumed independently by each root MO at completion — Black-218 Dye deducted only from MO-A-Black-218, Red-X Dye only from MO-A-Red-X\n\nThe greige batch is prepared once. Dyeing and finishing happen separately per colour, each consuming its own colorant.',
        },
        {
            heading: 'Material Requirements View',
            body: 'Expanding a Production Run row reveals a live material requirements panel. This panel aggregates component demand across all Manufacturing Orders in the run, compares totals against current stock, and highlights shortfalls in red. Requirements are grouped by item, attribute variant, and source location. A per-MO breakdown shows exactly which order contributes how much to each line — useful for partial release decisions.',
        },
        {
            heading: 'Dual-Track Timestamps',
            body: 'Every Manufacturing Order and Work Order records four timestamps: Target Start, Target End (the plan), Actual Start, and Actual End (what happened). The difference between target and actual gives the schedule variance. All four timestamps are visible on the MO detail view and on printed work order documents.',
        },
        {
            heading: 'Incremental Completion',
            body: 'Manufacturing Orders support incremental completion — operators can log partial output quantities against an MO without completing it. Each completion entry deducts raw material components proportionally from stock and credits finished goods output immediately. The MO auto-completes when total logged output reaches the ordered quantity. This allows in-progress stock movements to be captured accurately for long-running production runs.',
        },
        {
            heading: 'MO Status Gates',
            body: 'An MO cannot be started until all upstream dependencies are met. For Production Run MOs, this means all consolidated component MOs (the shared sub-assembly orders) must reach Completed status before any dependent root MO can be started. This enforces the correct material flow sequence and prevents finishing orders from proceeding without their required inputs.',
        },
        {
            heading: 'Shop Floor QR Terminal',
            body: 'The /scanner page provides a mobile-optimised operator interface. Each printed MO includes a QR code. Operators scan the QR code with a phone or handheld device to pull up that MO and update its status or log a completion entry — without needing to log in to the full desktop UI. Status changes broadcast to all connected users via WebSocket.',
        },
        {
            heading: 'Key Actions',
            items: [
                'Create Manufacturing Orders manually or from Sales Order lines',
                'Create Production Runs with multiple BOM entries to batch colour and size variants together',
                'Shared sub-assemblies (greige, base components) are automatically consolidated into one MO per unique sub-BOM',
                'View aggregated material requirements per Production Run with stock shortfall highlighting',
                'Log incremental completions to record partial output and trigger proportional material deductions',
                'Track MO and WO status from Pending through to Completed with target vs. actual timestamps',
                'Use material interlock gates to prevent downstream orders starting before upstream components are complete',
                'Scan QR codes at the shop floor terminal to update status from mobile devices',
                'Print individual MO and WO sheets with QR codes, component lists, and routing steps',
            ],
        },
    ],
};
