# Terras ERP

**Terras ERP** is a high-performance, enterprise-grade Enterprise Resource Planning system specifically engineered for the complexities of modern manufacturing and high-volume inventory operations. Built on a cutting-edge stack of **FastAPI** and **Next.js**, Terras ERP combines industrial-strength data integrity with a fluid, desktop-class user experience.

## 🚀 Key System Modules

### 🏭 Advanced Manufacturing & MES
*   **Master-Detail BOM Designer**: A professional, recursive interface for managing complex multi-level product hierarchies.
*   **Precision Recipe Logic**: Native support for **Percentage-Based BOMs** and wastage **Tolerances** with recursive quantity scaling.
*   **Dual-Track Operational Tracking**: Comprehensive lifecycle monitoring capturing Target Start/End vs. Actual Start/End timestamps.
*   **Shop Floor QR Terminal**: A mobile-first operator interface for scanning physical work orders and updating production status in real-time with built-in material interlocks.
*   **Lead Time Analytics**: Instant quantification of manufacturing performance and delay variance.

### 📦 Inventory & Material Management
*   **Materialized Performance Backbone**: Utilizes a dedicated $O(1)$ summary architecture to provide instant stock lookups across millions of ledger entries.
*   **Industrial Search Engine**: Powered by PostgreSQL **GIN Trigram Indexing**, enabling fuzzy, lightning-fast searches across massive product catalogs.
*   **Attributes & Multi-Variants**: Comprehensive management of item variations (Color, Size, Material) with multi-attribute matching logic.
*   **Lifecycle Traceability**: Detailed chronological history panes for every item, featuring JSON data diffs for total auditability.

### 🛒 Supply Chain & Partners
*   **Refactored Procurement**: Dedicated modules for **Sales Orders** (Customer Demand) and **Purchase Orders** (Supplier Procurement).
*   **Automated Purchase-to-Stock**: One-click "Receive" workflow that automatically processes deliveries and increments inventory at target warehouses.
*   **Professional Documentation**: Industry-standard, branded A4 print templates for all order types with auto-resolved partner addresses and variant specifications.
*   **PLM Sampling Workflow**: Independent prototype management system linked to sales demand for seamless prototype-to-production transitions.

### 📊 Intelligence & Real-Time Ops
*   **Terras Smart Advisor**: An operational intelligence layer calculating real-time **Production Yield** and **Delivery Readiness** through recursive material coverage analysis.
*   **Live WebSocket Event Stream**: Bi-directional event bus that broadcasts system updates (e.g., status changes, stock movements) to all users instantly without page refreshes.
*   **Predictive Data Lifecycle**: Hover-triggered background pre-fetching and persistent Master Data caching for zero-latency navigation.

## 🛠️ System Infrastructure
*   **Themed Interface Engine**: Instantly switch between Modern, Compact, and the high-density **Classic (Windows XP)** desktop styles.
*   **Dynamic Database Manager**: Hot-swap SQLAlchemy connections and manage point-in-time snapshots (Postgres/SQLite) directly through the Admin UI.
*   **Multi-Language (i18n)**: Full native support for **English** and **Indonesian**.
*   **Enterprise Security**: Robust **OAuth2 + JWT** authentication with granular **Role-Based Access Control (RBAC)** and category-level visibility restrictions.

## 💻 Tech Stack
*   **Backend**: Python 3.11+, FastAPI, SQLAlchemy 2.0, PostgreSQL 15, `orjson`, GZip compression.
*   **Frontend**: TypeScript, Next.js 14, React 18, Bootstrap 5, `html5-qrcode`.
*   **Infrastructure**: Fully containerized with Docker & Docker Compose.

## 📚 Documentation
- [**Full Feature List**](FEATURES.md): An exhaustive breakdown of every capability in the system.
- [**API Documentation**](http://localhost:8000/docs): Interactive Swagger UI (available when running).

## ⚡ Getting Started

### Installation
1.  **Clone the repository**.
2.  **Configure Environment**: `cp .env.example .env`
3.  **Start the System**:
    ```bash
    docker-compose up --build -d
    ```
4.  **Initialize & Sync Data (Required for First Run)**:
    ```bash
    docker-compose exec api python -m app.db.init_db
    ```

## License
This project is currently licensed under the **MIT License**.

Copyright (c) 2026 Terras Systems.
