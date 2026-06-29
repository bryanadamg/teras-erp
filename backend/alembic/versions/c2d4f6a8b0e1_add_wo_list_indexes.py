"""Add indexes for work order list scalability (P2)

Revision ID: c2d4f6a8b0e1
Revises: b1c2d3e4f5a6
Create Date: 2026-06-29
"""
from typing import Sequence, Union
from alembic import op

revision: str = 'c2d4f6a8b0e1'
down_revision: Union[str, None] = 'b1c2d3e4f5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE INDEX IF NOT EXISTS ix_work_orders_status ON work_orders(status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_work_orders_manufacturing_order_id ON work_orders(manufacturing_order_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_manufacturing_orders_status ON manufacturing_orders(status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_manufacturing_orders_code ON manufacturing_orders(code)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_work_orders_status")
    op.execute("DROP INDEX IF EXISTS ix_work_orders_manufacturing_order_id")
    op.execute("DROP INDEX IF EXISTS ix_manufacturing_orders_status")
    op.execute("DROP INDEX IF EXISTS ix_manufacturing_orders_code")
