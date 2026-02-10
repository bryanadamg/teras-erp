# Teras ERP

**Teras ERP** is a professional-grade, modular Enterprise Resource Planning system engineered for high-stakes manufacturing and inventory operations. Built on a high-performance stack of **FastAPI** and **Next.js**, it bridges the gap between engineering, sales, and the factory floor.

## Recent Updates (v2.1.0)
*   **Audit Trail**: System-wide logging of all user actions for compliance and traceability.
*   **BOM Designer**: A modular, visual interface for designing complex, multi-level recipes.
*   **Bulk Import Engine**: Mass data entry support via CSV/Excel for Items, BOMs, and Stock.
*   **Production Calendar**: Visual timeline for scheduling and monitoring production deadlines.
*   **Item-Level RBAC**: Granular security controls allowing role-based access to specific item categories.

## 🖥️ Desktop Installation Guide (Windows)

Teras ERP can be packaged as a standalone Windows application (`.exe`). This allows for a native desktop experience with a dedicated window, taskbar icon, and **Cloud Auto-Updates**.

### 1. Prerequisites
Ensure you have the following installed on your build machine:
*   **Python 3.11+**: [Download here](https://www.python.org/)
*   **Node.js 18+ & npm**: [Download here](https://nodejs.org/)
*   **Git**: [Download here](https://git-scm.com/)

### 2. Setup & Configuration
1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/YourUsername/teras-erp.git
    cd teras-erp
    ```
2.  **Configure Database**:
    *   Teras ERP Desktop requires a centralized **PostgreSQL** database (Scenario B).
    *   Edit `electron/resources/.env.production` (create it if missing) and set your production database credentials:
    ```env
    DATABASE_URL=postgresql+psycopg2://user:pass@your-server-ip:5432/erp_db
    NEXT_PUBLIC_API_BASE=http://localhost:8000/api
    ```

### 3. Build the Installer
We have provided a master script to automate the complex multi-stage build process.
1.  Open a terminal in the root directory.
2.  **Run the Master Builder**:
    ```bash
    python build_installer.py
    ```
    *This script will automatically:*
    *   *Install all Frontend dependencies and generate a static build.*
    *   *Compile the Python Backend into a hidden background executable (`backend.exe`).*
    *   *Package everything into a single Windows Installer.*

### 4. Installation
1.  Once the script finishes, navigate to the `electron/dist/` folder.
2.  Locate the file named **`Teras ERP Setup 2.x.x.exe`**.
3.  Transfer this file to any client computer in your office and run it.
4.  The application will install to the user's `AppData` and create a **Desktop Shortcut**.

### 5. Pulling Cloud Updates
One of the core strengths of this architecture is the **Seamless Update Workflow**:
1.  **On the Server**: When you want to push new features, simply pull the latest code and run `python build_installer.py` again with an incremented version number in `electron/package.json`.
2.  **On the Client**: The next time a user opens the Teras ERP desktop app, it will detect the new version in the background. A prompt will appear: *"Update Ready. Restart now to install?"*
3.  Click **Yes**, and the system will update itself in seconds without losing any data.

---

## 🏭 Core Modules
*   **Engineering**: Visual BOM Designer with recursive tree visualization.
*   **Manufacturing**: Expandable Production Schedule with real-time shortage tracking.
*   **Inventory**: Multi-attribute stock management with strict negative-stock prevention.
*   **Sales**: Incoming PO tracking and Sample Request (PLM) workflows.
*   **Admin**: Audit Logs, User Management, and Interface Customization (Classic/Modern).

## License
This project is licensed under the **MIT License**.

Copyright (c) 2026 Teras Systems.
