# Teras ERP

**Teras ERP** is a next-generation, modular Enterprise Resource Planning system engineered for agility and precision in manufacturing and inventory operations. Built on a high-performance stack of **FastAPI** and **Next.js**, Teras ERP delivers an enterprise-grade user experience with the flexibility required by modern production environments.

## Core Capabilities

### 📦 Advanced Inventory & Variation Control
*   **Multi-Dimensional Attributes**: Link items to multiple attribute types (e.g., Color *and* Size). Define specific values (Red, XL) dynamically during transactions.
*   **Lifecycle Item Management**: Full control over your item master data. Create, edit, and refine item details (Code, Name, UOM) at any stage.
*   **Sample-to-Production Lineage**: Seamlessly track the transition from customer samples to finished production goods with integrated relationship mapping.
*   **Dynamic Categorization**: Organize inventory with custom categories (e.g., Raw Materials, WIP, Finished Goods) managed in a dedicated metadata suite.
*   **Multi-Location Warehousing**: Dedicated management for tracking real-time stock balances across unlimited physical or logical warehouses.

### 🏭 Manufacturing & Engineering (MES)
*   **Dynamic Bill of Materials (BOM)**: Engineering-grade recipe management with support for multi-variant inputs and outputs.
*   **Production Execution**: Streamlined Work Order tracking. Generate orders directly from active BOMs and monitor progress (Pending → In Progress → Completed).
*   **Automated Stock Reconciliation**: Completing a Work Order automatically deducts raw materials and adds finished goods to your inventory based on the BOM definition.

### ⚙️ Intelligent System Automation
*   **Configurable Code Engine**: Customize how the system generates unique IDs for BOMs and Work Orders. Combine prefixes, suffixes, item metadata, and timestamps into a standardized format.
*   **Smart Validation**: Intelligent rejection of duplicate codes with automatic unique suggestions (e.g., `ITEM-1`, `ITEM-2`) that preserve your form progress.
*   **Professional Reporting**: Audit-ready Stock Ledger and Production reports with granular date-range filtering and optimized "one-click" print layouts.

### 🖥️ Adaptive User Experience
*   **Themed Interface Engine**: Choose between four distinct UI/UX styles:
    *   **Default (Corporate)**: Professional and balanced.
    *   **Modern**: Soft edges and contemporary spacing.
    *   **Compact**: High-density data view for power users.
    *   **Classic (XP)**: A complete Windows XP-inspired overhaul for users comfortable with legacy desktop applications.
*   **Expandable Navigation**: Intuitive sidebar with nested management folders for a clean, logical workspace.
*   **Toast Notification System**: Modern, non-intrusive feedback system that adapts visually to your selected UI theme.

## Technical Architecture

*   **Backend**: Python 3.11+, FastAPI, SQLAlchemy (ORM), PostgreSQL.
*   **Frontend**: TypeScript, Next.js 14, React, Bootstrap 5 (with Bootstrap Icons).
*   **Infrastructure**: Fully containerized with Docker & Docker Compose.
*   **Data Persistence**: Robust host-mounted PostgreSQL volumes with subdirectory mapping for high stability on Windows/Linux.

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

## License

This project is currently licensed under the **MIT License**.

Copyright (c) 2026 Teras Systems.

---
*Note: While currently open-source, future versions of Teras ERP or specific enterprise modules may transition to a proprietary licensing model. The codebase provided in this repository is and will remain available under the MIT License.*