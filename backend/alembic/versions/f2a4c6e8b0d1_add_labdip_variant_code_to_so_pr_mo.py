"""add labdip_variant_code to sales order lines, pr bom entries, and MOs

Lets an order be placed against a shade still in lab dip (not yet approved to a
Color Library color). The stable identity is the lab dip variant_code (e.g.
'00006-A'), preserved across reject->resubmit. On lab dip approval the minted
color is auto-backfilled onto rows matching this code.

Revision ID: f2a4c6e8b0d1
Revises: d4a6c8e0f2b5
Create Date: 2026-07-20 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'f2a4c6e8b0d1'
down_revision: Union[str, None] = 'd4a6c8e0f2b5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # sales_order_lines: pending shade ref (stable code + item row for trace)
    op.execute("ALTER TABLE sales_order_lines ADD COLUMN IF NOT EXISTS labdip_variant_code VARCHAR(64)")
    op.execute("ALTER TABLE sales_order_lines ADD COLUMN IF NOT EXISTS labdip_item_id UUID")
    op.execute(
        "ALTER TABLE sales_order_lines ADD CONSTRAINT fk_sol_labdip_item "
        "FOREIGN KEY (labdip_item_id) REFERENCES lab_dip_items(id) ON DELETE SET NULL"
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_sales_order_lines_labdip_variant_code ON sales_order_lines (labdip_variant_code)")

    # pr_bom_entries
    op.execute("ALTER TABLE pr_bom_entries ADD COLUMN IF NOT EXISTS labdip_variant_code VARCHAR(64)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_pr_bom_entries_labdip_variant_code ON pr_bom_entries (labdip_variant_code)")

    # manufacturing_orders
    op.execute("ALTER TABLE manufacturing_orders ADD COLUMN IF NOT EXISTS labdip_variant_code VARCHAR(64)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_manufacturing_orders_labdip_variant_code ON manufacturing_orders (labdip_variant_code)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_manufacturing_orders_labdip_variant_code")
    op.execute("ALTER TABLE manufacturing_orders DROP COLUMN IF EXISTS labdip_variant_code")

    op.execute("DROP INDEX IF EXISTS ix_pr_bom_entries_labdip_variant_code")
    op.execute("ALTER TABLE pr_bom_entries DROP COLUMN IF EXISTS labdip_variant_code")

    op.execute("DROP INDEX IF EXISTS ix_sales_order_lines_labdip_variant_code")
    op.execute("ALTER TABLE sales_order_lines DROP CONSTRAINT IF EXISTS fk_sol_labdip_item")
    op.execute("ALTER TABLE sales_order_lines DROP COLUMN IF EXISTS labdip_item_id")
    op.execute("ALTER TABLE sales_order_lines DROP COLUMN IF EXISTS labdip_variant_code")
