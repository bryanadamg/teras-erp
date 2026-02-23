# Terras ERP

**Terras ERP** is a next-generation, modular Enterprise Resource Planning system engineered for agility and precision in manufacturing and inventory operations. Built on a high-performance stack of **FastAPI** and **Next.js**, Terras ERP delivers an enterprise-grade user experience with the flexibility required by modern production environments.

## Core Capabilities

### 🌐 Corporate-Retro Landing Page
*   **High-Impact Entry**: A terminal-inspired public entry point featuring interactive "AUTH_TERMINAL" effects for secure system access.
*   **Technical Discovery**: Dynamic overview of core modules and direct access to system architecture specifications for stakeholders.

### 📊 Scalable Business Intelligence
*   **KPI Caching (New)**: Instant dashboard loading via a persistent cache layer, preventing expensive re-calculations on every refresh.
*   **Enterprise Data Volume (New)**: Optimized to handle hundreds of thousands of records without UI lag using **Server-Side Pagination** and **SQL Aggregations**.
*   **Visual Monitoring**: Real-time tracking of warehouse distribution, SKU diversity, and live production progress bars.

### 💾 Dynamic Infrastructure & Portability (New)
*   **Hot-Swap Database Manager**: Administrators can switch the entire system's data context at runtime by updating SQLAlchemy connection strings through the UI.
*   **Point-in-Time Snapshots**: Native support for creating, downloading, and uploading database snapshots (PostgreSQL/SQLite) for rapid backup and recovery.
*   **Environment Portability**: Easily migrate data between development, testing, and production environments using the built-in management dashboard.

### 🛒 Refactored Supply Chain & Partners
*   **Sales vs. Procurement**: Distinct modules for **Sales Orders (SO)** (Customer Demand) and **Purchase Orders (PO)** (Supplier Procurement).
*   **Centralized Directory**: Unified management of **Customers** and **Suppliers** with detailed address tracking and status control.
*   **Searchable Intelligence**: System-wide **Searchable Dropdown Module** allowing instant lookups within massive datasets of items and partners.
*   **Industry-Standard Sampling**: Dedicated **Sample Request** workflow (Draft -> In Production -> Sent -> Approved/Rejected) linked to Incoming POs.
*   **Master Sample Management**: Separate workspace for defining prototype templates before promotion to production items.
*   **Strict Integrity**: Multi-attribute matching logic prevents negative stock and ensures raw material availability.

### 🏭 Advanced Manufacturing & Engineering (MES)
*   **Recursive BOM Designer**: Split-pane Master-Detail interface for managing deep product structures and sub-assemblies.
*   **Sampling Lifecycle (PLM)**: Dedicated **Sample Request** workflow (Draft -> Production -> Sent -> Approved) with traceability to Sales Orders.
*   **Production Planning**: Integrated **Production Calendar** for deadline tracking and a "Live" schedule showing real-time material shortages.
*   **Execution Monitoring**: Expandable Production Schedule showing real-time material shortages and component-level warehouse overrides.
*   **Routing & Operations**: Define factory **Work Centers** and **Operations** directly within engineering definitions.

### 🔐 Enterprise Security & Audit
*   **JWT Authentication**: Industry-standard **OAuth2 + JWT** token-based security for all sessions.
*   **System-Wide Audit Trail**: Comprehensive logging of all `CREATE`, `UPDATE`, and `DELETE` actions, including JSON diffs of changes.
*   **Granular RBAC**: Role-Based Access Control with **Category-level visibility restrictions** for sensitive data protection.

### 🖥️ Adaptive User Experience
*   **Themed Interface Engine**: Instantly toggle between Modern, Compact, and the high-efficiency **Classic (Windows XP)** style.
*   **Multi-Language Support (i18n)**: Full native support for **English** and **Indonesian**.
*   **Mobile Optimized**: Responsive navigation and data grids tailored for smartphones and tablets.

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
