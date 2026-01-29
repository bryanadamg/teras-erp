# Teras ERP

**Teras ERP** is a next-generation, modular Enterprise Resource Planning system engineered for agility and precision in manufacturing and inventory operations. Built on a high-performance stack of **FastAPI** and **Next.js**, Teras ERP delivers an enterprise-grade user experience with the flexibility required by modern production environments.

## Core Capabilities

### 🌐 Interactive Public Landing Page (New)
*   **Modular Overview**: A modern, responsive entry point showcasing the system's value proposition and core modules.
*   **Feature Discovery**: Interactive sections for Inventory, Manufacturing, Engineering, and Sales tracking.
*   **Integrated Portal**: Direct access to the secure login control center.

### 📊 Insightful Business Dashboard
*   **Operational KPIs**: Instant visibility into SKUs, Low-Stock Alerts, Active Production, Pending WO, Active Samples, and Open POs.
*   **Warehouse Distribution**: Visual representation of inventory quantities and SKU diversity across multiple storage locations.
*   **Real-time Activity Feed**: Live tracking of the latest stock movements and production statuses.

### 🔐 Enterprise Security & Identity
*   **JWT Authentication**: Industry-standard **OAuth2 + JWT** token-based security for all API transactions and sessions.
*   **Role-Based Access Control**: Standardized roles (Admin, Store Manager, Production Manager, Operator) with pre-defined permission sets.
*   **Granular Permission Overrides**: Assign specific functional access directly to individual users for hybrid operational roles.
*   **Account Self-Service**: Integrated "Account Settings" allowing users to manage their own **Username**, **Full Name**, and **Password** securely.

### 📦 Precision Inventory & Sample Lifecycle (PLM)
*   **Industry-Standard Sampling**: Dedicated **Sample Request** workflow (Draft -> In Production -> Sent -> Approved/Rejected) linked to Incoming POs.
*   **Master Sample Management**: Separate workspace for defining generic sample templates (Prototypes) before they are promoted to production items.
*   **Managed Metadata**: Centralized management for **Units of Measure (UOM)** and **Categories**.
*   **Strict Integrity**: Built-in safeguards prevent negative stock and enforce material availability using multi-attribute matching logic.

### 🏭 Manufacturing & Engineering (MES)
*   **Hierarchical BOMs**: Visual tree-style display for nested recipes and sub-assemblies.
*   **Execution Monitoring**: Expandable Production Schedule showing real-time material shortages and source locations per Work Order.
*   **Advanced Logistics**: Support for **Cross-Location Work Orders**, allowing component-level warehouse overrides.
*   **Routing & Operations**: Define factory **Work Centers** and **Operations** directly within engineering definitions.

### 🖥️ Adaptive User Experience
*   **Mobile Responsive**: Fully optimized for smartphones and tablets with a collapsible navigation and responsive data grids.
*   **Multi-Language Support (i18n)**: Instantly toggle between **English** and **Indonesian**.
*   **Themed Interface Engine**: Choose between Modern, Compact, and the high-efficiency **Classic (Windows XP)** style.

## Technical Architecture

*   **Backend**: Python 3.11+, FastAPI, SQLAlchemy (ORM), PostgreSQL, Python-Jose (JWT).
*   **Frontend**: TypeScript, Next.js 14, React, Bootstrap 5.
*   **Infrastructure**: Fully containerized with Docker & Docker Compose.
*   **Security**: Non-root container execution, network isolation, and dynamic CORS configuration.

## Getting Started

### Prerequisites
*   Docker & Docker Compose

### Installation & Run
1.  **Clone the repository**.
2.  **Configure Environment**:
    ```bash
    cp .env.example .env
    # Edit .env with your configuration
    ```
3.  **Start the System**:
    ```bash
    docker-compose up --build -d
    ```
4.  **Access the Application**:
    *   **Frontend Portal**: [http://localhost:3030](http://localhost:3030)
    *   **Backend API**: [http://localhost:8000/api/docs](http://localhost:8000/api/docs)

## Future Industrial Modules (Roadmap)

1.  **Procurement & Supplier Management (Source to Pay)**
    *   Supplier Master, Outgoing Purchase Orders, and Goods Receipt Notes (GRN).
2.  **Logistics & Fulfillment**
    *   Packing Slips, Waybills, and automated shipping stock deduction.
3.  **Costing Engine (Financials)**
    *   FIFO / Weighted Average valuation and real-time Work-in-Progress (WIP) calculation.
4.  **Quality Control (QC)**
    *   Inspection Checkpoints (Inward, In-Process, Final) with Reject/Rework logic.

## License

This project is currently licensed under the **MIT License**.

Copyright (c) 2026 Teras Systems.
