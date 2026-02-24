# Terras ERP - Feature Documentation

This document provides a comprehensive list of all features implemented in the Terras ERP system, categorized by module.

## 🏗️ Core Architecture & Scalability
- **Tech Stack**: Python 3.11 (FastAPI), React 18 (Next.js 14), PostgreSQL 15, SQLAlchemy.
- **High-Volume Performance Engine (New)**:
  - **Server-Side Pagination**: Standardized chunked data loading (50 records/page) across all modules (Inventory, WO, Logs) to handle 100,000+ records without lag.
  - **Database Aggregation**: Stock balances and KPIs are calculated via optimized SQL queries (`GROUP BY`, `SUM`) rather than in-memory Python loops.
  - **Indexing Strategy**: Comprehensive B-Tree indexes on all foreign keys and frequently filtered columns (`category`, `status`, `timestamp`) for sub-50ms query times.
  - **Persistent Caching**: Background service calculates and caches expensive Dashboard KPIs to ensure instant page loads.
- **Containerization**: Fully Dockerized environment with `docker-compose` for easy deployment.
- **Security**: 
  - OAuth2 Password Flow with JWT Authentication.
  - Role-Based Access Control (RBAC) with granular permissions.
  - **Category Visibility**: API-level data filtering restricting users to specific item categories (e.g., specific departments).

## 💾 Dynamic Infrastructure (New)
- **Hot-Swap Database Manager**:
  - **Runtime Connection Switching**: Admin UI to switch the active database connection string without restarting containers.
  - **Multi-Provider Support**: Seamlessly handles PostgreSQL (Production) and SQLite (Archive/Dev) connections.
- **Snapshot & Recovery**:
  - **Point-in-Time Backups**: One-click generation of `.sql` (Postgres) or `.sqlite` database dumps.
  - **Environment Portability**: Download/Upload snapshots to migrate data between Local, Staging, and Production environments.
  - **Instant Rollback**: Restore functionality that cleanly disposes of active connections and re-initializes the schema from a backup file.

## 📦 Inventory Management
- **Searchable Intelligence**: Custom **Searchable Dropdown** components replace standard selects, allowing instant type-ahead filtering for Items, Partners, and BOMs in massive lists.
- **Item Master**: 
  - Comprehensive CRUD with duplicate code prevention and smart suggestion logic.
  - **Lifecycle History Pane (New)**: Slide-out audit trail visualizing chronological changes and JSON data diffs for every item.
  - Comprehensive CRUD for products and materials.
  - **Traceability**: Direct linkage to source `Sample Request` IDs for prototype-to-production tracking.
  - **Validation**: 
    - **Duplicate Prevention**: strict checks against existing item codes.
    - **Smart Suggestions**: If a duplicate code is detected, the system suggests a unique indexed alternative (e.g., `ITEM-001` -> `ITEM-001-1`).
- **Attributes & Variants**:
  - Define attributes like Color, Size, Material.
  - **Predictive Input**: Intelligence to suggest sequential values (e.g., if "Size 10" exists, suggest "Size 11").
- **Warehouse Management**:
  - Multi-location support (Warehouses, Bins, Shelves).
  - Real-time Stock Balance calculation.
- **Stock Control**:
  - **Live Ledger**: Paginated view of historical stock movements.
  - **Strict Validation**: Prevents negative stock and validates attribute compatibility.

## ⚙️ Engineering & BOM (Advanced)
- **Recursive BOM Designer**:
  - **Branching Automation (New)**: "Wizard" mode allows defining multi-level naming patterns (e.g., Level 1 -> Level 2 -> Level 3) to auto-generate complex, branching product trees with sibling items.
  - **Configuration Profiles**: Save and load frequently used automation structures (e.g., "Standard Textile", "Chemical Mix").
- **Complex Recipe Logic**:
  - **Percentage-Based BOMs**: Define components by ratio (e.g., 50% / 50%) rather than fixed units.
  - **Configurable Tolerances**: Set a global "Tolerance %" on the BOM header to automatically calculate buffer/wastage requirements during production.
- **Routing**: Integrated definition of Work Centers and Operations with time estimation.
  - **Smart Matching**: Case-insensitive and trimmed matching to find existing items in the database.
  - **Deduplication**: If a component in the chain already exists and has a BOM, the automator links to it instead of creating a duplicate.
  - **Attribute Inheritance**: Automatically copies attribute definitions (e.g., Color) from the Finished Good to all new WIP items in the chain.
- **Routing & Operations**:
  - Define Work Centers (Stations).
  - Assign operations to BOM levels with sequence logic (auto-increments by 10) and time estimation.
- **Code Configuration**: 
  - Customizable patterns for auto-generating BOM codes.
  - Option to include Variant values directly in the generated BOM code.

## 🏭 Manufacturing (MES)
- **Operator Scan Terminal (New)**:
  - **QR Code Scanning**: Dedicated tab using the device camera to scan physical Work Order documents.
  - **Action Card**: Instantly displays the scanned order's status and relevant actions (Start, Complete, Cancel).
  - **Safety Interlocks**: Prevents starting production via scanner if materials are insufficient.
- **Production Execution**:
  - **Smart Material Calculation**: Automatically computes required quantities based on BOM ratios and tolerance factors (e.g., `Base Qty * % * 1.1`).
  - **Availability Check**: Real-time validation of stock levels across specific source locations before releasing a WO.
- **Documentation**:
  - **Professional Printout**: A4-optimized PDF generation with a unique QR code for tracking.
  - **Recursive Pick List**: Expands the entire BOM tree to show every single raw material needed, even for sub-assemblies.

## 🛒 Supply Chain & Procurement (Refactored)
- **Unified Partner Directory**:
  - Centralized management for **Customers** and **Suppliers**.
  - Track active status, addresses, and transaction history.
- **Sales Orders (Incoming)**:
  - Manage Customer Orders (formerly "Incoming POs").
  - Linked to specific Customers.
- **Purchase Orders (Outgoing)**:
  - **New Module**: Create orders for Suppliers to buy raw materials.
  - **Purchase-to-Stock Workflow**: "Receive" button automatically processes the PO, updating its status and incrementing inventory at the target warehouse in one transaction.
- **Sample Requests (PLM)**:
  - **Decoupled Workflow**: Create samples independently for internal R&D or link them to a specific Sales Order.
  - **Sample-Specific Filtering**: Dropdowns strictly limit "Base Item" selection to the "Sample" category to prevent pollution of production master data.

## 📊 Analytics & Dashboard
- **Real-Time KPIs**: Instant metrics for Low Stock, Active Production, and Open Orders.
- **Visual Monitoring**: Live progress bars for manufacturing status.
- **Activity Feed**: Recent system-wide audit logs.
- **Theming**: "Classic XP" theme for high-contrast, high-density industrial environments.
