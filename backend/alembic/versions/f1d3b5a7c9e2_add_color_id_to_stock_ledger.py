"""add color_id to stock_ledger

Revision ID: f1d3b5a7c9e2
Revises: e2c4a6b8d0f3
Create Date: 2026-07-18

Persists the FG shade on each ledger row so sync_stock_balances can fold it back
into the balance variant_key (per-color FG stock nets/stores separately).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "f1d3b5a7c9e2"
down_revision = "e2c4a6b8d0f3"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("stock_ledger", sa.Column("color_id", UUID(as_uuid=True), nullable=True))
    op.create_index("ix_stock_ledger_color_id", "stock_ledger", ["color_id"])
    op.create_foreign_key(
        "fk_stock_ledger_color_id_colors",
        "stock_ledger",
        "colors",
        ["color_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade():
    op.drop_constraint("fk_stock_ledger_color_id_colors", "stock_ledger", type_="foreignkey")
    op.drop_index("ix_stock_ledger_color_id", table_name="stock_ledger")
    op.drop_column("stock_ledger", "color_id")
