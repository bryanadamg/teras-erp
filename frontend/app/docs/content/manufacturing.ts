import { DocPage } from '../docsContent';

export const manufacturingPage: DocPage = {
    slug: 'manufacturing',
    title: 'Manufacturing',
    subtitle: 'Plan, execute, and track production with Production Runs, Manufacturing Orders, and Work Orders.',
    badges: ['Production Runs', 'Manufacturing Orders', 'Work Orders', 'Work Queue', 'Variant Consolidation', 'Beaming', 'Weaving Monitor', 'Lot Tracking', 'MES'],
    sections: [
        {
            heading: 'Three-Tier Production Model',
            body: 'Every production campaign in Terras ERP follows a three-tier hierarchy — Production Run → Manufacturing Order → Work Order:',
            steps: [
                'Production Run (PR) — the top-level planning container. A run carries one or more BOM entries (one per item, colour, or size variant) and, on creation, generates the finished-goods Manufacturing Orders and consolidates shared sub-assembly demand across every entry. It provides a single material requirements view across the whole batch.',
                'Manufacturing Order (MO) — the production plan for one finished good and quantity, linked to a BOM. It snapshots its BOM lines at creation time so later BOM edits do not disturb in-flight orders, carries status and target/actual timestamps, and is the level managers monitor.',
                'Work Order (WO) — the execution-level task card under an MO, one per routing step (e.g. "Beaming", "Weaving", "Dyeing", "QC"). Work Orders are created and dispatched to the floor manually, are logged independently of one another, and are the unit that moves stock: completing a WO deducts the components it consumes and posts its output.',
            ],
            callout: {
                type: 'info',
                text: 'Work Orders carry the QR code that operators scan on the shop floor. Manufacturing Orders are supervisory and never carry a QR code.',
            },
        },
        {
            heading: 'Work Orders — Floor Execution',
            body: 'Work Orders are independent task cards, not an automatically-generated routing chain. They are created manually for the steps a run needs, can be created while the parent MO is still PENDING, and can be logged in any order — there is no sequential gate between WOs on the same MO.',
            items: [
                'Each WO defines its own input and output stock locations (defaulted from its work centre).',
                'Completing a WO deducts the BOM components it consumes from the input location and posts its output to the output location.',
                'Lot-tracked materials require a specific lot to be selected at consumption; lot-tracked or beam outputs auto-create a new output lot (see Lot Tracking and Beaming).',
                'A WO advances to IN_PROGRESS automatically on its first logged completion.',
                'WO cards can be printed individually or bulk-printed for an entire run, each with a QR code, component list, and routing detail.',
            ],
        },
        {
            heading: 'Work Centres, Groups & Locations',
            body: 'Work centres are defined under Settings → Routing. Each has a type (GENERAL, BEAMING, WEAVING, DYEING, SETTING, …) and optional default input/output stock locations that flow onto the Work Orders assigned to it. Work centres can be organised into parent/child groups, and the Work Order list can be filtered by work-centre group to give each floor area its own queue.',
            callout: {
                type: 'info',
                text: 'Assigning a WO to a DYEING work centre auto-resolves the matching active dye recipe for the MO\'s attributes and pre-creates a pending Dyeing Run — see the Dyeing & Setting page.',
            },
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
                text: 'Consolidated component MOs are marked as shared. Prepare and complete the shared component MOs first so the base material exists in stock — a root MO can only be started once its components are available (the start transition checks stock and blocks on a shortfall).',
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
        },
        {
            heading: 'Case 2 — Colour Variants Sharing a Greige Base',
            body: 'Item-A has colour variants (Black-218, Red-X). Each colour has its own BOM that adds only the variant-specific colorant on top of the same shared greige/base item, Item-B. There is one greige BOM (BOM-B) and one recipe for it — no duplicated base BOM per colour.',
            code:
`BOM-A-Black-218  →  Item-A [Black-218]
  ├─ Item-B          80%   [shared greige — BOM-B]
  └─ Black-218 Dye   5 m   [variant-specific]

BOM-A-Red-X      →  Item-A [Red-X]
  ├─ Item-B          80%   [same shared BOM-B]
  └─ Red-X Dye       5 m   [variant-specific]`,
            callout: {
                type: 'info',
                text: 'Add one BOM entry per colour to the Production Run. Pass 2 groups the shared greige (Item-B via BOM-B) under one identical key across every colour entry, so a single consolidated Item-B component MO is created for the whole batch. Each root MO carries its colour attribute, so finished goods credit to Item-A [Black-218] and Item-A [Red-X] separately.',
            },
            table: {
                headers: ['PR Entry', 'Variant BOM', 'Shared greige', 'Root MO produced'],
                rows: [
                    ['Entry 1', 'BOM-A-Black-218', 'BOM-B (Item-B)', 'Item-A [Black-218]'],
                    ['Entry 2', 'BOM-A-Red-X',     'BOM-B (Item-B)', 'Item-A [Red-X]'],
                    ['Consolidated', '—', 'BOM-B (Item-B)', 'One shared Item-B component MO'],
                ],
            },
        },
        {
            heading: 'Material Requirements View',
            body: 'Expanding a Production Run row reveals a live material requirements panel. This aggregates component demand across all Manufacturing Orders in the run, compares totals against current stock, and highlights shortfalls. A per-MO breakdown shows each order\'s contribution to every line.',
        },
        {
            heading: 'Beaming & Beam Stock',
            body: 'For woven products, warp beams are planned and tracked as stock lots:',
            items: [
                'Beam Planning Modal — bulk-create BEAMING Work Orders for a run from one screen, including repeat rows for multi-beam warps.',
                'Beam birth — completing a BEAMING WO creates a beam lot (a Batch) carrying its warp ends and the producing WO. The beam number is auto-generated (BM-YYYYMMDD-NNNN) or entered manually, and is surfaced so the operator can label the physical beam.',
                'Beam consumption — a WEAVING WO selects a beam lot to consume; the matching material line is deducted with full lot-consumption traceability.',
                'Remaining beam weight is read from the materialised stock balance — the ledger is the single source of truth, with no parallel counter. Warp-ends fields surface on the BOM and MO throughout.',
            ],
        },
        {
            heading: 'MO Status Flow',
            body: 'Manufacturing Orders follow a status progression:',
            steps: [
                'PENDING — MO created, not yet started. Material availability is checked on every list load. MO attributes (e.g. colour) can still be edited at this stage.',
                'IN_PROGRESS — Production has started. The start transition checks component stock at the source location; an insufficient balance blocks the transition.',
                'DELIVERED — Cumulative logged output has reached the ordered quantity, and a root MO\'s linked Sales Order is set to READY. The order stays OPEN: the floor can keep logging (spare beams, extra bags) up to the overdelivery tolerance. Reaching the target never closes an order by itself.',
                'COMPLETED — The order is explicitly closed by a user and accepts no further completions. Output and component movements are owned by the Work Order completions logged against the MO. A closed order can be reopened to IN_PROGRESS.',
                'CANCELLED — No stock movement. MO withdrawn before completion.',
            ],
        },
        {
            heading: 'Incremental Completion',
            body: 'Production is logged incrementally through the Manufacturing Order\'s Work Orders — operators record partial output without closing the order. Each completion entry immediately deducts the consumed components from stock and posts the produced quantity (and any output lot/beam). Cumulative logged output drives MO progress toward the ordered quantity.',
        },
        {
            heading: 'Dual-Track Timestamps',
            body: 'Every Manufacturing Order and Work Order records four timestamps:',
            table: {
                headers: ['Field', 'Set by', 'Purpose'],
                rows: [
                    ['Target Start', 'Planner at creation', 'Planned production start date'],
                    ['Target End',   'Planner at creation', 'Planned production completion date'],
                    ['Actual Start', 'System on first activity', 'Real production start timestamp'],
                    ['Actual End',   'System on completion',   'Real completion timestamp'],
                ],
            },
        },
        {
            heading: 'Sales Order Lineage',
            body: 'Production traces back to the originating Sales Order. A Production Run, its MOs, its WOs, and the beams they produce all carry the SO reference, surfaced as SO badges across the PR, MO, and batch screens and as a dedicated Lineage view on the Sales Order. For shared component MOs (which have no direct SO), the beam falls back to the Production Run\'s Sales Order so origin is still traceable.',
        },
        {
            heading: 'Work Queue — "What Can I Start Next?"',
            body: 'The Work Queue is a shop-floor dispatch screen: one work-centre type\'s open Work Orders, priority-ordered, each stamped with a material-readiness verdict. Rather than trusting a raw stock number, it walks on-hand stock through open orders in priority order — the first order in line claims what it needs, and the next order only sees what is left — so two orders competing for the same greige are never both shown as ready.',
            table: {
                headers: ['Verdict', 'Meaning'],
                rows: [
                    ['Ready', 'Full material requirement is available now'],
                    ['Partial', 'Some, but not all, of the requirement is available'],
                    ['Short', 'Not enough material is available anywhere in the priority queue'],
                    ['Staged', 'Material has already been transferred to this order and is waiting'],
                    ['Running', 'The order already has logged activity'],
                    ['Waiting Upstream / Waiting Prior', 'Blocked on an earlier routing step or a higher-priority order finishing first'],
                    ['Not Released', 'An open Manufacturing Order with no Work Order dispatched yet — still competes fairly for the same stock'],
                ],
            },
            callout: {
                type: 'info',
                text: 'Only the step\'s core substrate gates the verdict — greige for dyeing, yarn for warping, mounted beams for weaving. Auxiliary chemicals and trims are reported for visibility but never block a Ready verdict.',
            },
        },
        {
            heading: 'Weaving Monitor',
            body: 'The Weaving Monitor tracks loom efficiency per work centre against a production calendar: a target output is calculated from each machine\'s rate and number of lines over a 24-hour, three-shift working day, and actual output (read from logged completions) is compared against it as an efficiency percentage. A per-machine calendar of working weekdays plus scheduled holidays decides which days count toward the target.',
        },
        {
            heading: 'Shop Floor QR Terminal',
            body: 'The /scanner page provides a mobile-optimised operator interface. Each printed Work Order carries a QR code; scanning it opens that WO\'s completion entry form, where the operator logs produced quantity, picks consumed lots, and (for beams) records the beam number. Status changes broadcast to all connected users via WebSocket.',
        },
        {
            heading: 'Key Actions',
            items: [
                'Create Production Runs with multiple BOM entries to batch colour and size variants together',
                'Shared sub-assemblies (incl. shared greige) are automatically consolidated into one component MO per unique sub-BOM',
                'View aggregated material requirements per Production Run with per-MO contribution breakdown',
                'Create Work Orders manually for the routing steps a run needs, each with its own input/output location',
                'Plan beaming in bulk and track each beam as a stock lot from beaming through weaving',
                'Log incremental completions on Work Orders to post output and deduct components, with lot selection where required',
                'Track MO status through PENDING → IN_PROGRESS → DELIVERED → COMPLETED, where reaching the target quantity delivers the order but leaves it open for further logging',
                'Over-issue a run deliberately (spare beams against bad yarn) by raising the overdelivery tolerance on that order, without touching the BOM',
                'Monitor target vs. actual timestamps to measure schedule variance',
                'Open the Work Queue to see, per work centre, which open Work Orders are actually ready to start with material on hand',
                'Track loom efficiency against a per-machine production calendar on the Weaving Monitor',
                'Scan WO QR codes at the shop floor terminal to log completions from mobile devices',
                'Trace any production back to its originating Sales Order',
            ],
        },
    ],
};
