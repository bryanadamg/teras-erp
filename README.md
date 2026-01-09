# Teras ERP

**Teras ERP** is a modern, modular Enterprise Resource Planning system designed to streamline manufacturing and inventory operations. Built with a robust **FastAPI** backend and a responsive **Next.js** frontend, Teras ERP offers a scalable foundation for businesses looking to digitize their production workflows.

## Core Capabilities

### 📦 Intelligent Inventory Management
*   **Comprehensive Item Master**: Centralized management of products and materials with support for unique coding, UOMs, and detailed specifications.
*   **Dynamic Variants**: Flexible handling of product variations (e.g., Size, Color, Grade) without database clutter.
*   **Attribute Templates**: Define reusable attribute sets (e.g., "Color: Red, Blue, Green") to rapidly generate variants for new product lines.
*   **Multi-Location Warehousing**: Track stock levels across multiple physical or logical storage locations.

### 🏭 Advanced Manufacturing
*   **Bill of Materials (BOM)**: Create complex, multi-level production recipes.
    *   Define **Finished Goods** with precise variant targeting.
    *   Map required **Raw Materials** (Items + Variants) and their quantities.
    *   Support for **Nested BOMs** (sub-assemblies) to reflect real-world production chains.
*   **Work Orders**: Manage production lifecycles. Create orders from BOMs, track status (Pending, In Progress, Completed), and monitor output quantities against due dates.

### 📊 Stock Control & Traceability
*   **Granular Stock Entry**: Execute manual stock movements with precision—specifying Item, Variant, and target Location.
*   **Real-time Stock Ledger**: An immutable, audit-ready history of all inventory movements for complete transparency and reporting.

### 🖥️ Modern User Experience
*   **Unified Dashboard**: A clean, responsive interface organized by function:
    *   **Inventory Master**: Items & Locations management.
    *   **Attributes**: Variant template configuration.
    *   **Bill of Materials**: Engineering and recipe management.
    *   **Manufacturing**: Work Order execution and tracking.
    *   **Reports**: Real-time stock ledger analysis.

## Technical Architecture

Built on industry-standard, high-performance technologies:

*   **Backend**: Python 3.11+, FastAPI, SQLAlchemy (ORM), PostgreSQL.
*   **Frontend**: TypeScript, Next.js 14, React, Bootstrap 5.
*   **Infrastructure**: Fully containerized with Docker & Docker Compose.

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
    *   **Frontend Dashboard**: [http://localhost:3030](http://localhost:3030)
    *   **Backend API Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)

## Roadmap

We are actively expanding the Manufacturing execution capabilities:

*   **Automated Material Allocation**: Reserve stock automatically upon Work Order creation.
*   **Production Consumption**: One-click deduction of raw materials based on BOM definitions during production runs.
*   **Costing Engine**: Real-time calculation of manufacturing costs based on material FIFO/weighted average cost.

## License

This project is currently licensed under the **MIT License**.

Copyright (c) 2026 Teras Systems.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

---
*Note: While currently open-source, future versions of Teras ERP or specific enterprise modules may transition to a proprietary licensing model. The codebase provided in this repository is and will remain available under the MIT License.*