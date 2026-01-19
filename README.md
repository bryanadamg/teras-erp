# Teras ERP

**Teras ERP** is a next-generation, modular Enterprise Resource Planning system engineered for agility and precision in manufacturing and inventory operations. Built on a high-performance stack of **FastAPI** and **Next.js**, Teras ERP delivers an enterprise-grade user experience with the flexibility required by modern production environments.

## Core Capabilities

### 📊 Insightful Business Dashboard
*   **Operational KPIs**: Instant visibility into total SKUs, low-stock alerts, pending orders, and active production.
*   **Real-time Activity Feed**: Live tracking of the latest stock movements and inventory adjustments.
*   **Production Monitoring**: Quick-glance table of ongoing Work Orders with deadline warnings and status tracking.

### 🔐 Advanced RBAC & User Management (New)
*   **Role-Based Access Control**: Standardized roles (Admin, Store Manager, Production Manager, Operator) with pre-defined permission sets.
*   **Granular Permission Overrides**: Assign specific tab or functional access (e.g., `inventory.delete`, `stock.entry`) directly to individual users for flexible operations.
*   **Administrative Control Panel**: Integrated interface for administrators to rename users, promote roles, and manage custom access levels in real-time.

### 📦 Precision Inventory & Variation Control
*   **Segmented Workspaces**: Dedicated sections for **Item Inventory** and **Samples** (Prototypes), ensuring development and production data remain separated.
*   **Managed Metadata**: Centralized management for **Units of Measure (UOM)** and **Categories**, providing standardized dropdowns throughout the system.
*   **Multi-Dimensional Attributes**: Link items to multiple attribute types (e.g., Color *and* Size).
*   **Strict Integrity**: Built-in safeguards prevent negative stock balances and enforce material availability before production begins.

### 🏭 Manufacturing & Engineering (MES)
*   **Hierarchical Recipe Visualization**: A visual expandable tree-style display for nested BOMs, allowing exploration of complex sub-assemblies.
*   **Advanced Routing & Operations**: Define factory **Work Centers** (Stations) and **Standard Operations** (Steps) directly within your BOMs.
*   **Production Lifecycle**: Full tracking with automated timestamps for **Started At** and **Finished At**, with smart overdue warnings.

### 💰 Sales & Order Tracking (New)
*   **Purchase Orders (Incoming)**: Track incoming POs from customers and map them against specific samples or production items.
*   **Status Workflow**: Monitor order status from entry to delivery.

### 🖥️ Adaptive User Experience
*   **Mobile Responsive**: Fully optimized for smartphones and tablets with a collapsible hamburger menu and responsive data tables.
*   **Multi-Language Support (i18n)**: Instantly toggle between **English** and **Indonesian**.
*   **Themed Interface Engine**: Choose between Default, Modern, Compact, and the high-efficiency **Classic (XP)** style.

## Technical Architecture

*   **Backend**: Python 3.11+, FastAPI, SQLAlchemy (ORM), PostgreSQL.
*   **Frontend**: TypeScript, Next.js 14, React, Bootstrap 5.
*   **Security**: Non-root container execution, network isolation, and environment-driven CORS configuration.
*   **Infrastructure**: Fully containerized with Docker & Docker Compose.

## Getting Started

### Prerequisites
*   Docker & Docker Compose

### Installation & Run
1.  **Clone the repository**.
2.  **Configure Environment**:
    ```bash
    cp .env.example .env
    # Edit .env with your secrets
    ```
3.  **Start the System**:
    ```bash
    docker-compose up --build -d
    ```
4.  **Access the Application**:
    *   **Dashboard**: [http://localhost:3030](http://localhost:3030)
    *   **API**: [http://localhost:8000/api/docs](http://localhost:8000/api/docs)

## Future Industrial Modules (Roadmap)

1.  **Procurement & Supplier Management (Source to Pay)**
    *   Supplier Master, Outgoing Purchase Orders (PO), and Goods Receipt Notes (GRN).
2.  **Logistics & Fulfillment**
    *   Packing Slips, Waybills, and automatic stock deduction upon shipment.
3.  **Traceability (Batch/Lot & Serial Tracking)**
    *   Track Batch Numbers and Expiry Dates throughout the supply chain.
4.  **Costing Engine (Financials)**
    *   FIFO / Weighted Average valuation and real-time WIP calculation.
5.  **Quality Control (QC)**
    *   Inspection Criteria and Checkpoints (Inward, In-Process, Final).

## License

This project is currently licensed under the **MIT License**.

Copyright (c) 2026 Teras Systems.
