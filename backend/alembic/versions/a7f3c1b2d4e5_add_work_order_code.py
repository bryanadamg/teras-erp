"""add work order code column

Revision ID: a7f3c1b2d4e5
Revises: 38109e90dea5
Create Date: 2026-05-17 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'a7f3c1b2d4e5'
down_revision: Union[str, None] = '38109e90dea5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS code VARCHAR(128)")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_work_orders_code "
        "ON work_orders (code) WHERE code IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_work_orders_code")
    op.execute("ALTER TABLE work_orders DROP COLUMN IF EXISTS code")
