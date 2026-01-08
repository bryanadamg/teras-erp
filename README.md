# Teras ERP

A simple, modular Enterprise Resource Planning (ERP) system built with **FastAPI** (Backend) and **Next.js** (Frontend).

## Features

### 1. Inventory Management
*   **Items**: Manage products and materials with support for unique codes, names, and units of measure (UOM).
*   **Variants**: Items can have specific variants (e.g., Size, Color).
*   **Attribute Templates**: Define reusable attribute sets (e.g., "Color: Red, Blue, Green") to quickly generate variants for new items.
*   **Locations**: Manage multiple warehouses or storage locations.

### 2. Manufacturing
*   **Bill of Materials (BOM)**: Define recipes for your products.
    *   Specify the **Finished Good** (Item + Variant) and output quantity.
    *   List required **Raw Materials** (Items + Variants) and their quantities.
    *   Supports **Nested BOMs** (a material in one BOM can be the finished good of another).

### 3. Stock Management
*   **Stock Entry**: Record manual stock movements (In/Out).
    *   Select Item, specific Variant, and target Location.
*   **Stock Ledger**: A comprehensive history of all stock transactions (Dates, References, Quantities).

### 4. User Interface
*   **Tabbed Dashboard**: Clean, responsive interface organized by function:
    *   *Inventory Master* (Items & Locations)
    *   *Attributes* (Variant Templates)
    *   *Bill of Materials* (BOM Management)
    *   *Stock Entry* (Operations)
    *   *Reports* (Stock Ledger)

## Tech Stack
*   **Backend**: Python, FastAPI, SQLAlchemy, PostgreSQL.
*   **Frontend**: TypeScript, Next.js, Bootstrap 5.
*   **Infrastructure**: Docker & Docker Compose.

## How to Run

1.  **Clone the repository**.
2.  **Start with Docker Compose**:
    ```bash
    docker-compose up --build
    ```
3.  **Access the Application**:
    *   **Frontend**: [http://localhost:3030](http://localhost:3030)
    *   **Backend API Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)

## Roadmap & Next Steps

### Upcoming Module: Work Orders
The next phase of development will focus on the execution of manufacturing processes.

*   **Work Order Creation**: Generate orders based on BOMs.
*   **Material Allocation**: Reserve stock for pending orders.
*   **Production Run**:
    *   **Consume Materials**: Automatically deduct raw materials from the specific location/variant.
    *   **Produce Goods**: Automatically add finished goods to stock upon completion.
