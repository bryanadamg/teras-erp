"""add item.variant_type and color_id on SO lines, PR bom entries, MOs

Revision ID: e2c4a6b8d0f3
Revises: d9f1b3c5e7a0
Create Date: 2026-07-18

FG variant model: Item.variant_type ('color'|'combo') drives the SO variant
picker. Color-type FGs carry a Color Library shade (color_id) threaded
SO line -> PR bom entry -> root MO so the DYEING WO auto-matches the recipe
by color_id.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "e2c4a6b8d0f3"
down_revision = "d9f1b3c5e7a0"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("items", sa.Column("variant_type", sa.String(length=16), nullable=True))

    for table in ("sales_order_lines", "pr_bom_entries", "manufacturing_orders"):
        op.add_column(table, sa.Column("color_id", UUID(as_uuid=True), nullable=True))
        op.create_index(f"ix_{table}_color_id", table, ["color_id"])
        op.create_foreign_key(
            f"fk_{table}_color_id_colors",
            table,
            "colors",
            ["color_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade():
    for table in ("manufacturing_orders", "pr_bom_entries", "sales_order_lines"):
        op.drop_constraint(f"fk_{table}_color_id_colors", table, type_="foreignkey")
        op.drop_index(f"ix_{table}_color_id", table_name=table)
        op.drop_column(table, "color_id")

    op.drop_column("items", "variant_type")
