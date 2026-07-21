"""add index on packing_orders.created_at

list_packing_orders (Packaging page) orders by PackingOrder.created_at.desc()
on every request, same missing-index bug already fixed for batches
(c2d4e6f8a0b1). Without an index, Postgres does a full seq scan + sort of the
whole packing_orders table for every page load — cost grows with total
packing-order history, so it only bites once a server has real volume.

Index-only change: no behavior change, no API/contract change.

Revision ID: d3e5f7a9b1c2
Revises: c2d4e6f8a0b1
Create Date: 2026-07-21
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'd3e5f7a9b1c2'
down_revision: Union[str, None] = 'c2d4e6f8a0b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute('CREATE INDEX IF NOT EXISTS ix_packing_orders_created_at ON packing_orders (created_at)')


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS ix_packing_orders_created_at')
