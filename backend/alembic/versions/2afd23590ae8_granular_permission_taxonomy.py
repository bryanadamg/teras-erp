"""granular permission taxonomy matching the Permissions settings redesign

Replaces the old ~14 broad domain permissions ("inventory.manage", "sales.manage",
etc.) with one `resource.action` permission per row/action in the Permissions
config spreadsheet (Sales Order, Customer, Item, Lot, Work Order, Dye Recipe, ...).
Route handlers are updated in the same change to check the new codes instead of
the old broad ones — this migration exists so no existing Role loses access when
that flip happens: for every legacy code a Role currently holds, it is also
granted the full superset of new granular codes that legacy code used to imply.
Old Permission rows and role_permissions links are left in place (harmless,
unused) rather than deleted, since nothing depends on them being absent.

Also adds Role.allowed_categories / Role.allowed_locations, extending the
existing Role.allowed_work_center_types scoping pattern to Item/Stock (category)
and Lot Management (location). User.allowed_categories is dropped — it was wired
into the model/schema/API/UI but never actually enforced anywhere (dead field);
scoping now lives on Role only, consistent with how work-center-type scope
already works.

Revision ID: 2afd23590ae8
Revises: a4c6e8b0d2f5
"""
import uuid
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '2afd23590ae8'
down_revision = 'a4c6e8b0d2f5'
branch_labels = None
depends_on = None

# (code, description) — one row per resource.action in the Permissions spreadsheet.
NEW_PERMISSIONS = [
    # Sales Order
    ("sales_order.create", "Create Sales Orders"),
    ("sales_order.edit", "Edit Sales Orders"),
    ("sales_order.delete", "Delete Sales Orders"),
    ("sales_order.create_pr", "Create Production Run from Sales Order"),
    ("sales_order.print", "Print Sales Orders"),
    ("sales_order.view", "View Sales Orders"),
    ("sales_order.close", "Close Sales Orders"),
    # Customer
    ("customer.create", "Add Customers"),
    ("customer.edit", "Edit Customers"),
    ("customer.delete", "Delete Customers"),
    ("customer.view", "View Customers"),
    # Supplier
    ("supplier.create", "Add Suppliers"),
    ("supplier.edit", "Edit Suppliers"),
    ("supplier.delete", "Delete Suppliers"),
    ("supplier.view", "View Suppliers"),
    # Sample Request
    ("sample_request.create", "Create Sample Requests"),
    ("sample_request.edit", "Edit Sample Requests"),
    ("sample_request.delete", "Delete Sample Requests"),
    ("sample_request.update_status", "Update Sample Request Status"),
    ("sample_request.print", "Print Sample Requests"),
    ("sample_request.view", "View Sample Requests"),
    # Purchase Order
    ("purchase_order.create", "Create Purchase Orders"),
    ("purchase_order.edit", "Edit Purchase Orders"),
    ("purchase_order.delete", "Delete Purchase Orders"),
    ("purchase_order.receive_goods", "Receive Goods against Purchase Orders"),
    ("purchase_order.print", "Print Purchase Orders"),
    ("purchase_order.view", "View Purchase Orders"),
    ("purchase_order.close", "Close Purchase Orders"),
    # Item Inventory (scoped by Role.allowed_categories)
    ("item.create", "Create Items"),
    ("item.edit", "Edit Items"),
    ("item.delete", "Delete Items"),
    ("item.import", "Import Items"),
    ("item.view", "View Items"),
    # Attribute
    ("attribute.create", "Create Attributes"),
    ("attribute.edit", "Edit Attributes"),
    ("attribute.delete", "Delete Attributes"),
    ("attribute.view", "View Attributes"),
    # Categorie
    ("category.create", "Create Categories"),
    ("category.edit", "Edit Categories"),
    ("category.delete", "Delete Categories"),
    ("category.view", "View Categories"),
    # Unit Of Measure
    ("uom.create", "Create Units of Measure"),
    ("uom.edit", "Edit Units of Measure"),
    ("uom.delete", "Delete Units of Measure"),
    ("uom.view", "View Units of Measure"),
    # Combo Library
    ("combo_library.create", "Create Combos"),
    ("combo_library.edit", "Edit Combos"),
    ("combo_library.delete", "Delete Combos"),
    ("combo_library.view", "View Combo Library"),
    # Lot Management (scoped by Role.allowed_locations)
    ("lot.create", "Create Lots"),
    ("lot.split", "Split Lots"),
    ("lot.delete", "Delete Lots"),
    ("lot.qc_reject", "QC Reject Lots"),
    ("lot.view", "View Lots"),
    # Stock In Hand (scoped by Role.allowed_categories)
    ("stock_on_hand.create", "Create Stock Entries"),
    ("stock_on_hand.adjust", "Adjust Stock On Hand"),
    ("stock_on_hand.move", "Move Stock On Hand"),
    ("stock_on_hand.view", "View Stock On Hand"),
    # Booking Stock
    ("booking_stock.view", "View Booking Stock"),
    # Location
    ("location.create", "Create Locations"),
    ("location.edit", "Edit Locations"),
    ("location.delete", "Delete Locations"),
    ("location.view", "View Locations"),
    # Bill of Material
    ("bom.create", "Create BOMs"),
    ("bom.edit", "Edit BOMs"),
    ("bom.delete", "Delete BOMs"),
    ("bom.view", "View BOMs"),
    # Routing and Ops
    ("routing.create", "Create Work Centers/Operations"),
    ("routing.edit", "Edit Work Centers/Operations"),
    ("routing.delete", "Delete Work Centers/Operations"),
    ("routing.view", "View Routing and Work Centers"),
    # Production Run
    ("production_run.create", "Create Production Runs"),
    ("production_run.edit", "Edit/Cancel Production Runs"),
    ("production_run.delete", "Delete Production Runs"),
    ("production_run.print", "Print Production Runs"),
    ("production_run.view", "View Production Runs"),
    # Manufacture Order
    ("manufacturing_order.create", "Create Manufacture Orders"),
    ("manufacturing_order.edit", "Edit Manufacture Orders"),
    ("manufacturing_order.delete", "Delete Manufacture Orders"),
    ("manufacturing_order.print", "Print Manufacture Orders"),
    ("manufacturing_order.view", "View Manufacture Orders"),
    ("manufacturing_order.close", "Close Manufacture Orders"),
    # Work Order (scoped by Role.allowed_work_center_types)
    ("work_order.create", "Create Work Orders"),
    ("work_order.log", "Log Work Order Production"),
    ("work_order.edit", "Edit Work Orders"),
    ("work_order.delete", "Delete Work Orders"),
    ("work_order.print_card", "Print Kartu Kerja"),
    ("work_order.print_label", "Print Work Order Labels"),
    ("work_order.view", "View Work Orders"),
    ("work_order.stage", "Stage Work Order Materials"),
    # Weaving Monitor
    ("weaving_monitor.start", "Start Weaving Runs"),
    ("weaving_monitor.stop", "Stop Weaving Runs"),
    ("weaving_monitor.view", "View Weaving Monitor"),
    # Calender
    ("calendar.edit", "Edit Work Center Calendars"),
    ("calendar.view", "View Work Center Calendars"),
    # Beam
    ("beam.unmount", "Unmount Beams"),
    ("beam.view", "View Beams"),
    # Dye Recipe
    ("dye_recipe.create", "Create Dye Recipes"),
    ("dye_recipe.edit", "Edit Dye Recipes"),
    ("dye_recipe.delete", "Delete Dye Recipes"),
    ("dye_recipe.print", "Print Dye Recipes"),
    ("dye_recipe.view", "View Dye Recipes"),
    # Dye Order / Setting Order (view-only floor status)
    ("dye_order.view", "View Dye Orders"),
    ("setting_order.view", "View Setting Orders"),
    # Color
    ("color_code.create", "Create Color Codes"),
    ("color_code.edit", "Edit Color Codes"),
    ("color_code.archive", "Archive Color Codes"),
    ("color_code.create_recipe", "Create Dyeing Recipe from Color Code"),
    ("color_code.view", "View Color Codes"),
    ("color_variant.create", "Create Color Variants"),
    ("color_variant.edit", "Edit Color Variants"),
    ("color_variant.delete", "Delete Color Variants"),
    # Lab Dip Request
    ("lab_dip_request.create", "Create Lab Dip Requests"),
    ("lab_dip_request.edit", "Edit Lab Dip Requests"),
    ("lab_dip_request.delete", "Delete Lab Dip Requests"),
    ("lab_dip_request.update_status", "Update Lab Dip Request Status"),
    ("lab_dip_request.print", "Print Lab Dip Requests"),
    ("lab_dip_request.view", "View Lab Dip Requests"),
    # Yarn Lab Dip
    ("yarn_lab_dip.view", "View Yarn Lab Dips"),
    # Platform
    ("stock_ledger.print", "Print Stock Ledger"),
    ("stock_ledger.view", "View Stock Ledger"),
    ("audit_log.view", "View Audit Log"),
    ("print_layout.edit", "Edit Print Layouts"),
    ("system_admin.create", "Create System Admin Records"),
    ("system_admin.edit", "Edit System Admin Records"),
    ("system_admin.delete", "Delete System Admin Records"),
]

# legacy broad code -> superset of new granular codes it used to imply.
# Any Role currently holding the legacy code also gets these, so nothing loses
# access once route handlers stop checking the legacy code.
LEGACY_GRANT_MAP = {
    "inventory.manage": [
        "item.create", "item.edit", "item.import", "item.view",
        "attribute.create", "attribute.edit", "attribute.view",
        "category.create", "category.edit", "category.view",
        "uom.create", "uom.edit", "uom.view",
        "combo_library.create", "combo_library.edit", "combo_library.view",
        "lot.create", "lot.split", "lot.qc_reject", "lot.view",
        "stock_on_hand.view",
    ],
    "inventory.delete": [
        "item.delete", "attribute.delete", "category.delete", "uom.delete",
        "combo_library.delete", "lot.delete",
    ],
    "locations.manage": ["location.create", "location.edit", "location.delete", "location.view"],
    "manufacturing.manage": [
        "bom.create", "bom.edit", "bom.delete", "bom.view",
        "routing.create", "routing.edit", "routing.delete", "routing.view",
    ],
    "work_order.manage": [
        "work_order.create", "work_order.log", "work_order.edit", "work_order.delete",
        "work_order.print_card", "work_order.print_label", "work_order.stage", "work_order.view",
        "manufacturing_order.create", "manufacturing_order.edit", "manufacturing_order.delete",
        "manufacturing_order.print", "manufacturing_order.close", "manufacturing_order.view",
        "production_run.create", "production_run.edit", "production_run.delete",
        "production_run.print", "production_run.view",
        "weaving_monitor.start", "weaving_monitor.stop", "weaving_monitor.view",
        "calendar.edit", "calendar.view", "beam.unmount", "beam.view",
    ],
    "work_order.create": ["work_order.create"],
    "work_order.log": ["work_order.log"],
    "work_order.edit": ["work_order.edit", "work_order.delete", "work_order.stage", "work_order.print_card", "work_order.print_label"],
    "stock.entry": ["stock_on_hand.create", "stock_on_hand.adjust", "stock_on_hand.move", "stock_on_hand.view"],
    "sales.manage": [
        "sales_order.create", "sales_order.edit", "sales_order.delete", "sales_order.create_pr",
        "sales_order.print", "sales_order.close", "sales_order.view",
        "customer.create", "customer.edit", "customer.delete", "customer.view",
        "supplier.create", "supplier.edit", "supplier.delete", "supplier.view",
        "sample_request.create", "sample_request.edit", "sample_request.delete",
        "sample_request.update_status", "sample_request.print", "sample_request.view",
    ],
    "purchasing.manage": [
        "purchase_order.create", "purchase_order.edit", "purchase_order.delete",
        "purchase_order.receive_goods", "purchase_order.print", "purchase_order.close",
        "purchase_order.view",
        "supplier.create", "supplier.edit", "supplier.delete", "supplier.view",
    ],
    "dyeing.manage": [
        "dye_recipe.create", "dye_recipe.edit", "dye_recipe.delete", "dye_recipe.print", "dye_recipe.view",
        "dye_order.view", "setting_order.view", "work_order.log",
        "color_code.create", "color_code.edit", "color_code.archive", "color_code.create_recipe", "color_code.view",
        "color_variant.create", "color_variant.edit", "color_variant.delete",
        "lab_dip_request.create", "lab_dip_request.edit", "lab_dip_request.delete",
        "lab_dip_request.update_status", "lab_dip_request.print", "lab_dip_request.view",
        "yarn_lab_dip.view",
    ],
}


def upgrade():
    op.add_column('roles', sa.Column('allowed_categories', postgresql.JSON(astext_type=sa.Text()), nullable=True))
    op.add_column('roles', sa.Column('allowed_locations', postgresql.JSON(astext_type=sa.Text()), nullable=True))
    op.drop_column('users', 'allowed_categories')

    conn = op.get_bind()

    for code, description in NEW_PERMISSIONS:
        exists = conn.execute(sa.text("SELECT 1 FROM permissions WHERE code = :code"), {"code": code}).first()
        if exists:
            continue
        conn.execute(
            sa.text("INSERT INTO permissions (id, code, description) VALUES (:id, :code, :description)"),
            {"id": str(uuid.uuid4()), "code": code, "description": description},
        )

    for legacy_code, new_codes in LEGACY_GRANT_MAP.items():
        conn.execute(
            sa.text("""
                INSERT INTO role_permissions (role_id, permission_id)
                SELECT DISTINCT rp.role_id, np.id
                  FROM role_permissions rp
                  JOIN permissions op ON op.id = rp.permission_id AND op.code = :legacy_code
                  JOIN permissions np ON np.code = ANY(:new_codes)
                 ON CONFLICT DO NOTHING
            """),
            {"legacy_code": legacy_code, "new_codes": new_codes},
        )


def downgrade():
    op.add_column('users', sa.Column('allowed_categories', postgresql.JSON(astext_type=sa.Text()), nullable=True))
    op.drop_column('roles', 'allowed_locations')
    op.drop_column('roles', 'allowed_categories')
    # New permission rows / role_permissions links are left in place — they are
    # inert without the route changes that check them, and deleting could strand
    # FKs on user_permissions grants made after upgrade.
