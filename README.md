# Teras ERP

**Teras ERP** is a high-performance, enterprise-grade Enterprise Resource Planning system built for textile manufacturing and high-volume inventory operations. The stack is **FastAPI + PostgreSQL** on the backend and **Next.js 14 + React 18** on the frontend, purpose-engineered for factory-floor speed and data integrity.

---

## Key Modules

### Manufacturing & MES

Teras ERP models production as a three-tier hierarchy — **Production Run → Manufacturing Order → Work Order**:

- **Production Runs (PR):** Top-level planning document. A run carries one or more BOM entries (one per item/colour/size variant), each with its own quantities. Creating a run generates the finished-goods Manufacturing Orders and **consolidates shared sub-assembly demand** across every variant into single component orders (see *Variant Consolidation* below).
- **Manufacturing Orders (MO):** The production plan for one item/batch. MOs snapshot their BOM lines at creation time (`MOPlannedComponent`) so later BOM edits never disturb in-flight orders. MO-level attributes (e.g. colour) are editable, and completions are logged with actual materials consumed per event.
- **Work Orders (WO):** Execution-level task cards under an MO, one per routing step. WOs are **created and dispatched manually to the floor** — they are independent units with dual-track timestamps (target vs. actual start/end) for variance analysis. Operators scan a WO's QR code at the Shop Floor terminal to log completions; each WO is logged independently.
- **Routing & Work Centers:** Each BOM defines an ordered list of operations (`BOMOperation`), each tied to a work centre and sequence. Six system operations ship seeded — **BEAMING, WARPING, WEAVING, DYEING, SETTING, FINISHING**. Work centres can be grouped hierarchically (parent/child) and typed, and each centre defines default **input and output stock locations** that flow onto its Work Orders.
- **Beam Planning Modal:** Bulk-create BEAMING work orders from a single planning screen, including repeat rows for multi-beam warps. Work-order cards can be bulk-printed for a whole run at once.
- **Shop Floor QR Terminal:** Mobile-first operator interface at `/scanner` for scanning physical work orders, logging completions, and consuming lots — all without a full desktop session.
- **Material Consumption & Output Posting:** Completing a work order auto-deducts BOM components from the input location and posts finished goods (and, where applicable, new output lots/beams) to the output location. Lot-tracked materials require a lot to be selected at consumption.

### Beaming & Beam Stock

Textile warp-beam tracking integrated into manufacturing:

- **Beam-as-Lot:** Each physical warp beam is tracked as a stock lot (`Batch`) carrying its warp **ends** and the work order that produced it. Remaining weight is read straight from the materialized stock balance — the ledger is the single source of truth.
- **Auto Beam Numbering:** A beam is born when a BEAMING work order completes; its number is auto-generated (`BM-YYYYMMDD-NNNN`) or entered manually and surfaced for the operator to label the physical beam.
- **Consume at Weaving:** Weaving work orders pick a beam lot to consume; the matching material line is deducted with full batch consumption traceability.
- **Warp Ends Spec:** BOMs and MOs surface warp-ends fields for beaming items end-to-end.

### BOM Designer

- **Recursive Multi-Level BOM:** Components can themselves have BOMs, enabling unlimited assembly tree depth. The designer renders the full tree with expand/collapse navigation, tooltips, and a widened structure panel.
- **Operations & Routing:** Assign each BOM node a sequence of operations and work centres directly in the designer; materials can be pegged to the operation step where they are consumed.
- **BOM Automator:** Wizard that auto-generates child Manufacturing Orders for each BOM level in one click, based on a parent MO and its nested assembly structure. Defaults follow each item's own UOM, and automator settings are saved per user.
- **Percentage-Based Quantities:** Component quantities can be expressed as percentages of the parent item's quantity. Validation enforces percentages at each individual node level (no sibling flattening).
- **Tolerance Configuration:** Per-line wastage tolerances for recipes that allow acceptable over/under consumption.
- **UOM-Aware:** Component and output quantities display their unit of measure throughout the designer, MO, and BOM views.
- **Root-Only Filter:** Toggle the BOM view to show only top-level (root) BOMs.
- **Print at Any Level:** Print a formatted A4 BOM sheet for any node in the assembly tree, not just the top-level finished good.

### Inventory & Material Management

- **Materialized Stock Summary:** A dedicated `stock_balances` table provides O(1) stock lookups — no summing ledger rows on read. Balances are updated atomically on every transaction.
- **Lot Tracking:** Mark any item lot-tracked. Lot-tracked items auto-create output lots (`LOT-…`) on work-order completion, require a supplier lot at goods receipt, and enforce lot selection on consumption and transfer. A backward **genealogy trace** walks any lot back through its consumed inputs, hop by hop, to raw fibre.
- **Packaging Units:** Track cones, boxes, and drums as independent tallies alongside the base quantity (no forced unit conversion) across goods receipt, transfers, and stock entry.
- **GIN Trigram Search:** PostgreSQL GIN trigram indexing enables fuzzy, sub-millisecond search across large item catalogs.
- **Attributes & Variants:** Define attribute axes (Colour, Size, Material, etc.) and generate variant combinations per item. Stock is tracked at the item + variant + location level via a sorted `variant_key`.
- **Location Categories:** Group stock locations (Raw Materials, Finished Goods, WIP, …) via a master-detail Locations screen with drag-and-drop assignment. Stock-on-hand can be filtered and grouped by location category.
- **Units of Measure (UOM):** Custom conversion factors per UOM allow unit-to-base-unit calculations (e.g. Roll → metres, Pic → units), including dual-UOM packaging factors.
- **Item Lifecycle History:** Every item has a chronological history pane showing JSON diffs of all field changes for total auditability.
- **Bulk Import:** Upload items in bulk via Excel through the Inventory UI.

### Dyeing & Setting

- **Dye Recipes:** Reusable master formula library. Each recipe stores chemical lines (dyes and auxiliaries) normalized per litre of bath water (g/L), a Bak Cuci wash bath sequence, and finishing treatment steps. Recipes carry the attribute values (e.g. colour) that bind them to matching Manufacturing Orders, and are referenced across multiple dyeing runs.
- **Lab Dip Requests:** A color-matching approval gate. Raise a lab dip (`LD-YYYY-#####`) against a customer, base item, and colour standard, track per-colour submission rounds through approval/rejection, and tie the approved dye recipe to production.
- **Kartu Celup Printout:** Print a formatted dyeing recipe card (Kartu Celup) directly from the recipe detail view. The printed card matches the physical document used at the factory: company header, job metadata (customer, PO, LOT, artikel, warna, color matching, volume air, machine parameters), chemical table (dyes then auxiliaries with rate and total columns), Bak Cuci sequence, and finishing lines.
- **Dyeing Runs:** Execution records for dyeing work orders. Each run captures job metadata (customer, PO, LOT), process parameters (liquor ratio, volume air, temperature, pressure, speed), and actual chemical consumption. Planned quantities are auto-scaled from the recipe (g/L × Volume Air) when the completion modal opens. Shade results (PASS / FAIL / REWORK) are recorded on completion. When a work order is assigned to a DYEING work centre, the matching recipe is resolved automatically and a pending dyeing run is pre-filled.
- **Setting Runs:** Execution records for heat-setting work orders. Captures machine speed (m/min), temperature, width, overfeed %, and records actual measurements on completion: actual width (cm), actual GSM (g/m²), and actual shrinkage (%).
- **Chemical Variance Tracking:** Planned vs. actual chemical quantities are stored separately per run, enabling recipe costing and per-batch variance analysis.
- **Batch Traceability:** Input and output batches are linked on each run. Output batches are auto-created on run completion (item derived from the parent Manufacturing Order), forming a traceable chain from raw fibre through dyeing and setting to finished fabric.

### Supply Chain & Partners

- **Sales Orders:** Capture customer demand with line items that support variant/size selection and link to the producing BOM. Individual "Produce" buttons per SO line trigger Production Run / MO creation, and orders are editable after creation.
- **SO → Production Lineage:** Trace any sales order down through its Production Runs, Manufacturing Orders, Work Orders, and beams. Lineage is surfaced as a dedicated view on the SO plus SO badges across the PR, MO, and batch screens, so every produced lot ties back to its originating order.
- **Purchase Orders:** Supplier procurement with packaging quantities (cones/boxes/drums), one-click goods receipt, a branded PO printout, and a force-close option for partially fulfilled orders.
- **Goods Receipt (GRN):** Receive against a PO into a chosen location with packaging counts and per-line supplier lots. Each receipt records the supplier's **Delivery Note / Surat Jalan** — number, date, and a scanned PDF/image attachment — at the header level, with a full per-delivery receipt history.
- **Partners:** Unified directory for both customers and suppliers, with contact details and order history.
- **PLM Sample Workflow:** Sample Masters define new products under development. Sample Requests are raised, tracked through approval stages (Requested → In Production → Ready → Approved/Rejected), support selectable sample materials, and allow attaching design files (images or Excel).
- **Print Templates:** A4-formatted, branded print templates for Sales Orders, Purchase Orders, Manufacturing Orders, Work Orders, BOM sheets, and Sample Requests — each with auto-resolved partner addresses and variant specifications.

### Variant Consolidation (MRP)

A first-class capability that prevents duplicated prep work across product variants:

- **Size variants:** One BOM with multiple sizes resolves to shared sub-components; operators see one aggregated prep order, not one per size.
- **Colour variants (greige base):** Colour variants of a finished good share the same greige/base item and a single recipe; only the colorant differs per variant. A multi-BOM Production Run consolidates the shared base into a single component MO and adds only the variant-specific component on top — no duplicated BOM per colour.

### Intelligence & Real-Time Ops

- **Terras Smart Advisor:** Calculates real-time Production Yield and Delivery Readiness through recursive material coverage analysis. Surfaces items at reorder level, overdue work orders, and purchase orders past expected delivery.
- **Live KPI Dashboard:** Real-time grid showing active SKUs, low-stock alerts, open production orders, and sales pipeline. Data is pushed via WebSocket without page refresh.
- **WebSocket Event Bus:** Redis pub/sub broadcasts status changes and stock movements to all connected clients instantly (`/api/ws/events`).
- **Hover Prefetch:** Hovering a sidebar link triggers a background data prefetch for that module, producing near-zero-latency navigation.

---

## System Infrastructure

- **Themed Interface Engine:** Switch between Modern, Compact, and Classic (Windows XP) visual styles.
- **Hot-Swap Database Manager:** Change or test alternate database connections from the Admin UI without a server restart. Supports point-in-time snapshot management for Postgres and SQLite.
- **Per-User Configuration:** Document code formats (PR/MO/recipe numbering) and BOM Automator profiles are saved per user.
- **Multi-Language (i18n):** Full native support for English and Indonesian.
- **Enterprise Security:** OAuth2 + JWT authentication with granular Role-Based Access Control (RBAC). Per-user category restrictions limit item visibility across all modules.
- **Audit Logging:** Every create/update/delete writes an immutable audit log entry with before/after field values. Logs are append-only and browsable by user, date, and entity type.
- **Performance:** GZip response compression, targeted database indexes, and paginated list endpoints throughout keep the UI responsive on large datasets.
- **Desktop App:** An Electron wrapper packages the frontend as a Windows desktop application.

---

## Tech Stack

| Layer | Technologies |
|---|---|
| Backend | Python 3.11+, FastAPI, SQLAlchemy 2.0, Alembic (migrations), PostgreSQL 15, Redis 7, `orjson`, GZip |
| Frontend | TypeScript, Next.js 14, React 18, Bootstrap 5, TanStack Query, `html5-qrcode` |
| Desktop | Electron (Windows) |
| Infrastructure | Docker & Docker Compose, Cloudflare Tunnel |

---

## Getting Started

### Prerequisites

A `.env` file at the repo root is required with the following variables:

```
POSTGRES_DB=
POSTGRES_USER=
POSTGRES_PASSWORD=
DATABASE_URL=
REDIS_URL=
NEXT_PUBLIC_API_BASE=
BACKEND_CORS_ORIGINS=
```

### Start the Stack

```bash
# Clone and configure
cp .env.example .env

# Start all services (api, db, redis, frontend)
docker compose up --build -d
```

On startup the API container runs database migrations (Alembic) and then seeds reference data (UOMs, categories, system attributes/operations, RBAC users, stock balances) automatically.

### Schema Migrations

All schema changes are managed with Alembic; seeding lives in `app.db.init_db` and never touches DDL.

```bash
# Generate a migration from model changes
docker compose exec api alembic revision --autogenerate -m "describe_change"

# Apply / inspect
docker compose exec api alembic upgrade head
docker compose exec api alembic current
```

### Local Development

```bash
# Backend (from /backend)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Frontend (from /frontend)
npm run dev    # http://localhost:3000
```

### Tests

```bash
# Backend tests (requires live PostgreSQL)
docker compose exec api pytest

# Frontend E2E tests
cd frontend && npx playwright test
```

---

## License

MIT License — Copyright (c) 2026 Teras Systems.
