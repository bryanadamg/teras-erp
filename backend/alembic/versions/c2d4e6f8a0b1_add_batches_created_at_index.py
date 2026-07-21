"""add index on batches.created_at

/batches/paginated (Lot Management page) orders by Batch.created_at.desc()
on every request, with no filter narrowing it in the common case. Missed by
the earlier perf-index sweep (f9a1c2d3e4b5). Without an index, Postgres does
a full seq scan + sort of the whole batches table for every page load — cost
grows with total lot count, which is why this only bites on servers with real
production history, not local/dev DBs.

Index-only change: no behavior change, no API/contract change.

Revision ID: c2d4e6f8a0b1
Revises: a5c7e9f1b3d4
Create Date: 2026-07-21
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'c2d4e6f8a0b1'
down_revision: Union[str, None] = 'a5c7e9f1b3d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute('CREATE INDEX IF NOT EXISTS ix_batches_created_at ON batches (created_at)')


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS ix_batches_created_at')
