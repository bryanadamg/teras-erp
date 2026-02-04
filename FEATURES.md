# Teras ERP - Feature Documentation

This document provides a comprehensive list of all features implemented in the Teras ERP system, categorized by module.

## 🏗️ Core Architecture & System
- **Tech Stack**: Python 3.11 (FastAPI), React 18 (Next.js 14), PostgreSQL 15, SQLAlchemy.
- **Containerization**: Fully Dockerized environment with `docker-compose` for easy deployment.
- **Security**: 
  - OAuth2 Password Flow with JWT Authentication.
  - Argon2 password hashing.
  - Role-Based Access Control (RBAC) with granular permissions.
- **Internationalization (i18n)**: 
  - Full support for English and Indonesian languages.
  - Context-aware translations for UI elements.
- **Theming Engine**:
  - **Classic (Windows XP)**: Pixel-perfect retro desktop experience.
  - **Modern**: Clean, flat design with rounded corners and shadows.
  - **Compact**: High-density layout for data-heavy users.
  - **Retro Landing**: Cyberpunk/Terminal style public landing page.

## 🔐 Authentication & User Management
- **Interactive Landing Page**: Retro-themed entry point with integrated login form.
- **Session Management**: Secure token handling with auto-refresh mechanism.
- **User Administration**:
  - Create/Update/Delete users.
  - Assign Roles (Admin, Manager, User).
  - Granular Permission checkboxes (e.g., `inventory.view`, `work_order.manage`).
  - Password reset functionality.
- **Audit Trail**: System-wide logging of all critical actions (Who, What, When, Details).

## 📦 Inventory Management
- **Item Master**: 
  - Comprehensive CRUD for products and materials.
  - Support for Attributes (Variants) like Color, Size, Material.
  - Auto-generation of Item Codes based on configurable patterns.
- **Warehouse Management**:
  - Multi-location support (Warehouses, Bins, Shelves).
  - Stock Balance tracking per location and variant.
- **Stock Control**:
  - Manual Stock Entries (In/Out/Transfer).
  - Strict validation preventing negative stock (unless configured otherwise).
  - Stock Ledger for historical movement tracking.
- **Metadata**:
  - Categories management.
  - Unit of Measure (UOM) management.
  - Attribute & Value management.
- **Bulk Operations**:
  - CSV Import for Items.
  - Export Item Templates.

## ⚙️ Engineering & BOM (Bill of Materials)
- **Recursive BOM Designer**:
  - Single-screen, multi-level tree editor for defining complex product structures.
  - In-place creation of sub-recipes (Sub-Assemblies).
  - Visual tree navigation with expansion/collapse.
- **BOM Automation Wizard**:
  - Define naming patterns (e.g., `ITEM` -> `WIP 1` -> `WIP 2`).
  - One-click generation of entire production trees (Items + BOMs).
  - Auto-detection of existing items to prevent duplicates.
  - Attribute inheritance from parent to child items.
- **Routing & Operations**:
  - Define Work Centers (Stations).
  - Define Standard Operations.
  - Assign operations to BOM levels with sequence and time estimation.
- **Code Configuration**: Customizable patterns for auto-generating BOM and Item codes.

## 🏭 Manufacturing (MES)
- **Work Orders (WO)**:
  - Create WOs linked to BOMs.
  - Auto-calculation of required materials based on BOM quantity.
- **Logistics**:
  - **Source Location**: Specify where raw materials are picked from.
  - **Target Location**: Specify where finished goods are stored.
  - Stock Availability Check before starting production.
- **Production Workflow**:
  - Status tracking: `PENDING` -> `IN_PROGRESS` -> `COMPLETED` / `CANCELLED`.
  - Auto-deduction of raw materials upon completion.
  - Auto-increment of finished goods upon completion.
- **Visual Scheduling**:
  - **Production Calendar**: Monthly calendar view of WOs based on Due Date.
  - Color-coded status indicators (Blue=Pending, Yellow=Active, Green=Done).
- **Print Engine**:
  - Detailed PDF-ready printout for individual Work Orders.
  - Recursive BOM listing (Pick List) showing all nested components.
  - Routing steps and sign-off areas.

## 🛒 Sales & Sampling
- **Purchase Orders (Incoming)**: 
  - Manage incoming orders from customers.
  - Track order status and quantities.
- **Sample Request (PLM)**:
  - Dedicated workflow for prototyping (`DRAFT` -> `IN_PRODUCTION` -> `SENT` -> `APPROVED`).
  - Separate "Sample Masters" inventory to keep prototypes distinct from production stock.

## 📊 Analytics & Dashboard
- **KPI Cards**: Real-time metrics for Inventory count, Low Stock, Active WOs, etc.
- **Visual Charts**: Warehouse Distribution bars.
- **Activity Feed**: Recent system movements.
- **Monitoring Table**: Live tracking of manufacturing progress.
