# Terras ERP - Feature Documentation

This document provides a comprehensive list of all features implemented in the Terras ERP system, categorized by module.

## 🏗️ Core Architecture & System
- **Tech Stack**: Python 3.11 (FastAPI), React 18 (Next.js 14), PostgreSQL 15, SQLAlchemy.
- **Containerization**: Fully Dockerized environment with `docker-compose` for easy deployment.
- **Security**: 
  - OAuth2 Password Flow with JWT Authentication.
  - Argon2 password hashing.
  - Role-Based Access Control (RBAC) with granular permissions (e.g., `work_order.manage`).
- **Internationalization (i18n)**: 
  - Full support for English and Indonesian languages.
  - Context-aware translations for UI elements.
- **Theming Engine**:
  - **Classic (Windows XP)**: Pixel-perfect retro desktop experience with "pushed-in/popped-out" 3D button states and beige aesthetics.
  - **Modern**: Clean, flat design with rounded corners and shadows.
  - **Compact**: High-density layout for data-heavy users.
  - **Retro Landing**: Cyberpunk/Terminal style public landing page with CRT scanline effects.

## 🔐 Authentication & User Management
- **Interactive Landing Page**: Retro-themed entry point with integrated login form and typewriter effects.
- **Session Management**: Secure token handling with auto-refresh mechanism and `localStorage` persistence.
- **User Administration**:
  - Create/Update/Delete users.
  - Assign Roles (Admin, Manager, User).
  - Granular Permission checkboxes.
  - Password reset functionality.
- **System-Wide Audit Trail**: 
  - Logs every `CREATE`, `UPDATE`, `DELETE`, and `STATUS_CHANGE` action.
  - Records the specific User ID, Timestamp, and a JSON diff of changes.
  - **Smart Serialization**: Automatically handles UUIDs and Date objects for JSON storage.

## 📦 Inventory Management
- **Item Master**: 
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
  - Manual Stock Entries (In/Out/Transfer).
  - Strict validation preventing negative stock.
  - **Stock Ledger**: Historical movement tracking.
- **UI Enhancements**:
  - **Forced Category Views**: Specialized tabs (like "Sample Masters") that filter the inventory list by specific categories.
  - **Confirm Modals**: Custom confirmation dialogs for all destructive actions to prevent accidental data loss.
  - **Error Feedback**: Toast notifications parse raw backend errors (e.g., Foreign Key Integrity Violations) into user-friendly messages explaining *why* an item cannot be deleted.

## ⚙️ Engineering & BOM (Bill of Materials)
- **Recursive BOM Designer**:
  - **Single-Screen Workflow**: A split-pane Master-Detail interface for managing deep product structures.
  - **Tree Navigation**: Visual tree with expansion/collapse, clearly marking "New Items" vs "Existing Recipes".
  - **In-Place Creation**: Ability to define a sub-recipe for a component without leaving the main BOM editor.
- **BOM Automation Wizard**:
  - Define naming patterns (e.g., `ITEM` -> `WIP 1` -> `WIP 2`).
  - **Full Tree Generation**: Recursively builds the entire chain of items and BOMs based on the pattern.
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
- **Work Orders (WO)**:
  - Create WOs linked to BOMs.
  - **Code Auto-Gen**: Configurable WO numbering.
- **Logistics & Availability**:
  - **Source Location**: Specify where raw materials are picked from.
  - **Target Location**: Specify where finished goods are stored.
  - **Stock Check**: Real-time validation of material availability before starting production.
- **Production Workflow**:
  - Status tracking: `PENDING` -> `IN_PROGRESS` -> `COMPLETED` / `CANCELLED`.
  - **Auto-Deduction**: Completing a WO automatically deducts raw materials and increments finished goods.
  - **Flexible Deletion**: Ability to delete Work Orders at any stage (even Completed), with audit logging.
- **Visual Scheduling**:
  - **Production Calendar**: Monthly calendar view of WOs based on Due Date.
  - **Compact Dashboard Widget**: A mini version of the calendar with dot indicators for the dashboard.
  - Color-coded status indicators (Blue=Pending, Yellow=Active, Green=Done) that respect theme contrast.
- **Print Engine**:
  - **Detailed PDF Printout**: Generates a professional Work Order document.
  - **Recursive Pick List**: The printout expands the BOM tree to show *every* single component needed, even from sub-assemblies.
  - **Quantity Scaling**: Automatically calculates required sub-component quantities based on the parent item's requirements and the WO batch size.

## 🛒 Sales & Sampling
- **Purchase Orders (Incoming)**: 
  - Manage incoming orders from customers.
  - Track order status and quantities.
- **Sample Request (PLM)**:
  - Dedicated workflow for prototyping (`DRAFT` -> `IN_PRODUCTION` -> `SENT` -> `APPROVED`).
  - Separate "Sample Masters" inventory to keep prototypes distinct from production stock.

## 📊 Analytics & Dashboard
- **KPI Cards**: Real-time metrics for Inventory count, Low Stock, Active WOs, Active Samples, and Open POs.
- **Visual Charts**: Warehouse Distribution bars.
- **Activity Feed**: Recent system movements (last 5 entries).
- **Monitoring Table**: Live tracking of manufacturing progress with status bars.