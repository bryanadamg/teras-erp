# Teras ERP

**Teras ERP** is a next-generation, modular Enterprise Resource Planning system engineered for agility and precision in manufacturing and inventory operations. Built on a high-performance stack of **FastAPI** and **Next.js**, Teras ERP delivers an enterprise-grade user experience with the flexibility required by modern production environments.

## Core Capabilities

### 📦 Advanced Inventory Control
*   **Lifecycle Item Management**: Full control over your item master data. Create, edit, and refine item details (Code, Name, UOM) at any stage.
*   **Dynamic Categorization**: Organize inventory with custom categories (e.g., Raw Materials, WIP, Finished Goods, Consumables) that you define and manage.
*   **Granular Variant Management**: 
    *   Add or remove variants (Color, Size, Grade) for existing items on the fly.
    *   Utilize **Attribute Templates** with intelligent auto-increment suggestions to rapidly define product lines.
*   **Multi-Location Warehousing**: Dedicated management view for tracking stock across unlimited physical or logical warehouses.

### 🏭 Manufacturing Execution System (MES)
*   **Bill of Materials (BOM)**: Engineering-grade recipe management.
    *   Support for complex, multi-level dependencies (Nested BOMs).
    *   Precise variant mapping for inputs and outputs.
*   **Work Orders**: Streamlined production tracking.
    *   Generate orders directly from active BOMs.
    *   Visual status tracking (Pending → In Progress → Completed) to monitor shop floor progress.

### ⚙️ System Configuration & Customization
*   **Dynamic Metadata**: Fully customizable Attribute Templates and Item Categories to adapt the system to your specific industry vertical.
*   **White-Label Ready**: Integrated system settings to customize the application identity (App Name) to match your organization.
*   **Data Persistence**: robust Docker-based database mounting ensures your critical business data is securely persisted on the host machine.

### 🖥️ Modern, Task-Oriented UI
*   **Next-Gen Interface**: A completely overhauled, responsive frontend featuring a professional sidebar navigation structure.
*   **Split-View Layouts**: Optimized views for high-productivity workflows—manage lists and edit details side-by-side without context switching.
*   **Visual Stock Ledger**: Real-time, audit-ready history of all inventory movements with advanced filtering.

## Technical Architecture

Teras ERP is built on a foundation of industry-standard, scalable technologies:

*   **Backend**: Python 3.11+, FastAPI, SQLAlchemy (ORM), PostgreSQL.
*   **Frontend**: TypeScript, Next.js 14, React, Bootstrap 5 (with Bootstrap Icons).
*   **Infrastructure**: Containerized with Docker & Docker Compose for consistent deployment.
*   **Database**: PostgreSQL 15 with host-mounted volumes for reliable data persistence.

## Getting Started

### Prerequisites
*   Docker & Docker Compose

### Installation & Run
1.  **Clone the repository**.
2.  **Start the System**:
    ```bash
    docker-compose up --build
    ```
3.  **Access the Application**:
    *   **Dashboard**: [http://localhost:3030](http://localhost:3030)
    *   **API Documentation**: [http://localhost:8000/docs](http://localhost:8000/docs)

## Roadmap

We are continuously evolving Teras ERP to meet enterprise demands:

*   **Automated Material Allocation**: Reserve stock automatically upon Work Order creation.
*   **Production Consumption**: One-click deduction of raw materials based on BOM definitions.
*   **Costing Engine**: Real-time calculation of manufacturing costs (FIFO/Weighted Average).
*   **User Role Management**: Granular permissions and access control.

## License

This project is currently licensed under the **MIT License**.

Copyright (c) 2026 Teras Systems.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

---
*Note: While currently open-source, future versions of Teras ERP or specific enterprise modules may transition to a proprietary licensing model. The codebase provided in this repository is and will remain available under the MIT License.*
