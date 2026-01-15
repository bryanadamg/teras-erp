# Teras ERP

**Teras ERP** is a next-generation, modular Enterprise Resource Planning system engineered for agility and precision in manufacturing and inventory operations. Built on a high-performance stack of **FastAPI** and **Next.js**, Teras ERP delivers an enterprise-grade user experience with the flexibility required by modern production environments.

## Core Capabilities

### 📊 Insightful Business Dashboard (New)
*   **Operational KPIs**: Instant visibility into total SKUs, low-stock alerts, pending orders, and active production.
*   **Real-time Activity Feed**: Live tracking of the latest stock movements and inventory adjustments.
*   **Production Monitoring**: Quick-glance table of ongoing Work Orders with deadline warnings and status tracking.

### 📦 Advanced Inventory & Variation Control
*   **Multi-Dimensional Attributes**: Link items to multiple attribute types (e.g., Color *and* Size). Define specific values (Red, XL) dynamically during transactions.
*   **Lifecycle Item Management**: Full control over your item master data. Create, edit, and delete item details (Code, Name, UOM) with ease.
*   **Strict Inventory Integrity**: Built-in safeguards prevent negative stock balances and ensure material availability before production begins.
*   **Multi-Location Warehousing**: Manage real-time stock levels across unlimited physical or logical storage locations.

### 🏭 Manufacturing & Engineering (MES)
*   **Hierarchical Recipe Visualization**: A visual expandable tree-style display for nested BOMs, allowing you to explore complex sub-assemblies and downstream recipes.
*   **Advanced Routing & Operations**: Define factory **Work Centers** (Stations) and **Standard Operations** (Steps). Map detailed production paths directly within your BOMs.
*   **Production Execution**: Full-lifecycle Work Order tracking from 'Pending' to 'Completed', with automated timestamps for start and finish times.
*   **Automated Stock Reconciliation**: One-click material deduction and finished good addition upon Work Order completion based on engineering definitions.

### ⚙️ Intelligent System Automation
*   **Configurable Code Engine**: Robust auto-generation logic for BOM and Work Order codes using prefixes, suffixes, metadata, and timestamps.
*   **Smart Validation**: Intelligent rejection of duplicate IDs with unique code suggestions (e.g., `ITEM-1`, `ITEM-2`) that preserve your form progress.
*   **Professional Reporting**: Audit-ready Stock Ledger and Production reports with granular date-range filtering and high-fidelity print layouts.

### 🖥️ Adaptive User Experience
*   **Multi-Language Support (i18n)**: Instantly toggle between **English** and **Indonesian** (Bahasa Indonesia).
*   **Themed Interface Engine**: Choose between four distinct styles:
    *   **Default (Corporate)**: Professional and balanced.
    *   **Modern**: Contemporary soft edges and spacing.
    *   **Compact**: High-density data view for power users.
    *   **Classic (XP)**: A nostalgic, high-efficiency overhaul for users familiar with legacy desktop applications.
*   **Toast Notification System**: Non-intrusive feedback system that adapts visually to your selected UI theme.

## Technical Architecture

*   **Backend**: Python 3.11+, FastAPI, SQLAlchemy (ORM), PostgreSQL.
*   **Frontend**: TypeScript, Next.js 14, React, Bootstrap 5 (with Bootstrap Icons).
*   **Infrastructure**: Fully containerized with Docker & Docker Compose.
*   **Data Persistence**: Robust host-mounted PostgreSQL volumes with subdirectory mapping for high stability.

## Getting Started

### Prerequisites
*   Docker & Docker Compose

### Installation & Run
1.  **Clone the repository**.
2.  **Start the System**:
    ```bash
    docker-compose up --build -d
    ```
3.  **Access the Application**:
    *   **Dashboard**: [http://localhost:3030](http://localhost:3030)
    *   **API Documentation**: [http://localhost:8000/docs](http://localhost:8000/docs)

## Future Industrial Modules (Roadmap)

1.  **Procurement & Supplier Management (Source to Pay)**
    *   Supplier Master, Purchase Orders (PO), and Goods Receipt Notes (GRN).
2.  **Sales & Customer Management (Order to Cash)**
    *   Customer Master, Sales Orders (SO), and Delivery Notes.
3.  **Traceability (Batch/Lot & Serial Tracking)**
    *   Track Batch Numbers and Expiry Dates throughout the supply chain.
4.  **Costing Engine (Financials)**
    *   FIFO / Weighted Average valuation and real-time WIP calculation.
5.  **Quality Control (QC)**
    *   Inspection Criteria and Checkpoints (Inward, In-Process, Final).
6.  **User Roles & Permissions (RBAC)**
    *   Granular access control and segregation of duties.

## License

This project is currently licensed under the **MIT License**.

Copyright (c) 2026 Teras Systems.