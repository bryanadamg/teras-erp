# Terras ERP - Feature Documentation

This document provides a comprehensive list of all features implemented in the Terras ERP system, categorized by module.

## 🏗️ Core Architecture & Scalability
- **Tech Stack**: Python 3.11 (FastAPI), React 18 (Next.js 14), PostgreSQL 15, SQLAlchemy.
- **Real-Time Event Stream (New)**: 
  - **WebSocket Integration**: Persistent bi-directional link between server and all clients.
  - **Signal-Based Updates**: Instant broadcasting of system events (e.g., Work Order status changes) to all connected managers and operators without polling.
- **Predictive Data Lifecycle (New)**:
  - **Hover-to-Fetch**: Background pre-fetching of tab data when a user hovers over sidebar links, reducing perceived latency to near-zero.
  - **Master Data Persistence**: Intelligent `localStorage` caching of static configurations (Locations, UOMs, Categories) with 1-hour TTL for instant "cold starts."
- **High-Volume Performance Engine**:
  - **Server-Side Pagination**: Standardized 50 records/page loading across all modules.
  - **Database Aggregation**: Real-time SQL-level computation for stock and KPIs.
  - **Indexing Strategy**: Comprehensive B-Tree indexes on all foreign keys and frequently filtered columns (`category`, `status`, `timestamp`) for sub-50ms query times.
  - **Connection Pooling**: Tuned SQLAlchemy pool (`pool_size=20`, `max_overflow=10`) for high-concurrency industrial environments.
- **Optimization Layer**:
  - **Gzip Middleware**: Automatic response compression for 80% payload reduction.
  - **Fast Serialization**: Native `orjson` default response class for high-speed JSON encoding.
- **Security**: 
  - OAuth2 Password Flow with JWT Authentication.
  - Role-Based Access Control (RBAC) with granular permissions.
  - **Category Visibility**: API-level data filtering restricting users to specific item categories.

## 💾 Dynamic Infrastructure
- **Hot-Swap Database Manager**:
  - **Runtime Switching**: Admin UI to switch active database connections without restart.
  - **Multi-Provider**: Support for PostgreSQL and SQLite.
- **Snapshot & Recovery**:
  - **Point-in-Time Backups**: Manual and automated database dumps.
  - **One-Click Restore**: Automatic schema re-initialization from snapshots.

## 📦 Inventory Management
- **Materialized Stock Summary (New)**: Dedicated `stock_balances` table providing **O(1) lookup time** for current levels, bypassing ledger summation for all critical checks.
- **Searchable Intelligence**: Global **Searchable Dropdown** components with virtualized rendering for 10,000+ item lists.
- **Server-Side Search**: PostgreSQL **GIN Trigram Indexing** for fuzzy, high-speed search across the entire database.
- **Lifecycle History Pane**: Chronological audit trail with JSON diffs for every item.
- **Item Master**: 
  - Comprehensive CRUD with duplicate code prevention and smart suggestion logic.
  - **Lifecycle History Pane (New)**: Slide-out audit trail visualizing chronological changes and JSON data diffs for every item.
  - Comprehensive CRUD for products and materials.
  - **Traceability**: Direct linkage to source `Sample Request` IDs for prototype-to-production tracking.
  - **Smart Suggestions**: If a duplicate code is detected, the system suggests a unique indexed alternative (e.g., `ITEM-001` -> `ITEM-001-1`).
- **Attributes & Variants**:
  - Define attributes like Color, Size, Material.
  - **Predictive Value Input**: Intelligence to suggest sequential values.
- **Warehouse Management**:
  - Multi-location support (Warehouses, Bins, Shelves).
  - Real-time Stock Balance calculation.
- **Stock Control**:
  - **Live Ledger**: Paginated view of historical stock movements.
  - **Strict Validation**: Prevents negative stock and validates attribute compatibility.

## ⚙️ Engineering & BOM (Advanced)
- **Recursive BOM Designer**:
  - **Single-Screen Workflow**: A split-pane Master-Detail interface for managing deep product structures.
  - **Tree Navigation**: Visual tree with expansion/collapse, clearly marking "New Items" vs "Existing Recipes".
- **BOM Automation Wizard**:
  - **Branching Automation**: Wizard for multi-level sibling item/BOM generation.
  - **Percentage-Based BOMs**: Define components by ratio (e.g., 50% / 50%) rather than fixed units.
  - **Configurable Tolerances**: Set a global "Tolerance %" on the BOM header to automatically calculate buffer/wastage requirements during production.
  - **Configuration Profiles**: Save and load frequently used automation rules.
  - **Attribute Inheritance**: Automatically copies attribute definitions from Finished Goods to WIP items.
- **Complex Recipe Logic**: Support for **Percentage-Based Quantities** and **Configurable Tolerances** (wastage buffers).
- **Routing**: 
  - Define Work Centers (Stations) with hourly rates.
  - Assign operations to BOM levels with sequence logic and time estimation.
- **Code Configuration**: Customizable patterns for auto-generating BOM codes, including variant values.

## 🏭 Manufacturing (MES)
- **Advanced Lifecycle Timeline (New)**: 
  - **Dual-Track Tracking**: Captures 4 distinct timestamps per order: Target Start, Target End, Actual Start (on start), and Actual End (on finish).
  - **Lead Time Variance**: Real-time calculation of production delays in hours.
- **Mobile Operator Terminal**: 
  - **Global Scan Shortcut**: Persistent header icon and mobile-first sidebar button for instant terminal access.
  - **QR Camera Integration**: Scan physical WOs to trigger status changes.
  - **Material Interlocks**: Prevents starting production if batch-calculated materials are insufficient.
- **Production Execution**:
  - Status tracking: `PENDING` -> `IN_PROGRESS` -> `COMPLETED` / `CANCELLED`.
  - **Auto-Deduction**: Completing a WO automatically deducts raw materials and increments finished goods.
- **Professional Documentation**: A4-optimized printouts with embedded QR codes and full production timeline.
- **Visual Scheduling**:
  - **Production Calendar**: Monthly calendar view of WOs based on Due Date.
  - **Compact Dashboard Widget**: A mini version of the calendar with status dot indicators.

## 🛒 Supply Chain & Procurement
- **Industry Standard Printouts (New)**: 
  - Professional, branded PDF-style templates for **Sales Orders** and **Purchase Orders**.
  - Includes auto-resolved Partner addresses, variant specs, and authorization signature blocks.
- **Architecture**: Distinct modules for **Sales Orders (SO)** (Customer Demand) and **Purchase Orders (PO)** (Supplier Procurement).
- **Purchase-to-Stock Workflow**: Automated "Receive" logic that increments warehouse inventory upon PO fulfillment.
- **Unified Partner Directory**: Centralized directory for **Customers** and **Suppliers** with detailed status control.
- **Sample Requests (PLM)**:
  - **Decoupled Workflow**: Create samples independently for R&D or link to Sales Orders.
  - **Sample Masters**: Dedicated inventory category to keep prototypes distinct from production stock.

## 📊 Analytics & Dashboard
- **Terras Smart Advisor (New)**: 
  - **Executive Summary**: Minimalist status ribbon providing prioritized actionable suggestions.
  - **Mathematical KPIs**: Real-time calculation of **Production Yield** (Completed vs. Started) and **Delivery Readiness** (Recursive material coverage for all open SOs).
- **Real-Time KPI Grid**: Instant metrics for SKUs, Low Stock, Active Production, and Open Orders.
- **Visual charts**: Warehouse distribution bars and historical activity feeds.
- **Persistent Cache**: Background calculations to ensure sub-second dashboard loading.
