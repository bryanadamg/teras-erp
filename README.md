# Terras ERP

**Terras ERP** is a next-generation, modular Enterprise Resource Planning system engineered for agility and precision in manufacturing and inventory operations. Built on a high-performance stack of **FastAPI** and **Next.js**, Terras ERP delivers an enterprise-grade user experience with the flexibility required by modern production environments.

## Core Capabilities

### 🏭 Advanced Manufacturing & Engineering (MES)
*   **Recursive BOM Designer**: Split-pane Master-Detail interface for managing deep product structures and sub-assemblies.
*   **Complex Recipe Logic (New)**: Support for **Percentage-Based Quantities** (e.g., 50% Material A + 50% Material B) and **Configurable Tolerances** to handle chemical formulas or variable-yield processes.
*   **Advanced Automation**: 
    *   **Branching Structure Generation**: Automatically build complex, multi-level product trees with sibling items (e.g., creating 3 color variants at Level 2 simultaneously).
    *   **Configuration Profiles**: Save and hot-swap automation rules (e.g., "Standard Textile", "Chemical Mix") to rapidly generate standardized BOMs.
*   **Shop Floor Terminal (New)**: dedicated **QR Scanner Interface** for operators. Scan a physical Work Order to instantly view status, validate material availability, and trigger production start/finish with a single tap.
*   **Production Planning**: Integrated **Production Calendar** for deadline tracking and a "Live" schedule showing real-time material shortages.

### 🛒 Supply Chain & Procurement (Refactored)
*   **Unified Partner Directory**: Centralized management of **Customers** and **Suppliers** with detailed address tracking and status control.
*   **Automated Stock Receipt (New)**: **Purchase-to-Stock** workflow allowing one-click receipt of Purchase Orders. Automatically increments inventory at the designated target warehouse upon approval.
*   **Sales vs. Procurement**: Distinct modules for **Sales Orders (SO)** (Customer Demand) and **Purchase Orders (PO)** (Supplier Procurement).
*   **Decoupled Sampling (PLM)**: Flexible **Sample Request** workflow that can operate independently for internal prototypes or link directly to Sales Orders for customer-specific development.

### 💾 Dynamic Infrastructure & Data Integrity
*   **Lifecycle History Pane (New)**: Detailed, slide-out audit trail for Items and Samples, visualizing chronological changes and JSON data diffs for total traceability.
*   **Hot-Swap Database Manager**: Administrators can switch the entire system's data context at runtime by updating SQLAlchemy connection strings through the UI—ideal for switching between Production, Staging, and Archive datasets instantly.
*   **Point-in-Time Snapshots**: Native support for creating, downloading, and uploading database snapshots (PostgreSQL/SQLite) for rapid backup and recovery.
*   **High-Volume Scalability**: Optimized to handle hundreds of thousands of records without UI lag using **Server-Side Pagination**, **SQL Aggregations**, and **KPI Caching**.

### 🌐 User Experience & Search
*   **Searchable Intelligence**: System-wide **Searchable Dropdown Module** allowing instant lookups within massive datasets of items, partners, and recipes.
*   **Corporate-Retro Aesthetics**: A distinct, high-impact entry point featuring interactive "AUTH_TERMINAL" effects and a Windows XP-inspired "Classic" theme option.
*   **Mobile Optimized**: Responsive navigation and data grids tailored for smartphones and tablets.

### 🔐 Enterprise Security & Audit
*   **JWT Authentication**: Industry-standard **OAuth2 + JWT** token-based security for all sessions.
*   **System-Wide Audit Trail**: Comprehensive logging of all `CREATE`, `UPDATE`, and `DELETE` actions.
*   **Granular RBAC**: Role-Based Access Control with **Category-level visibility restrictions** for sensitive data protection.

## Technical Architecture

*   **Backend**: Python 3.11+, FastAPI, SQLAlchemy 2.0 (Standard & JSONB), PostgreSQL 15.
*   **Performance**: Redis-ready caching, B-Tree Indexing, and offloaded DB aggregations.
*   **Frontend**: TypeScript, Next.js 14, React 18, Bootstrap 5.
*   **Infrastructure**: Fully containerized with Docker & Docker Compose (PostgreSQL Client integrated).

## 📚 Documentation

- [**Full Feature List**](FEATURES.md): A comprehensive breakdown of all system capabilities.
- [**API Documentation**](http://localhost:8000/docs): Swagger UI (available when running).

## Getting Started

### Installation & Run
1.  **Clone the repository**.
2.  **Configure Environment**: `cp .env.example .env`
3.  **Start the System**:
    ```bash
    docker-compose up --build -d
    ```
4.  **Simulate Large Data (Stress Test)**:
    ```bash
    docker-compose exec backend python scripts/seed_volume.py
    ```

## License

This project is currently licensed under the **MIT License**.

Copyright (c) 2026 Terras Systems.
