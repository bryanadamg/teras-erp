"""partial index on stock_balances(batch_key, qty) for lot filters

The Lot Management list (/batches/paginated) filters by lot status
("active" = has positive remaining) via a subquery that groups
stock_balances by batch_key and sums qty, restricted to batch_key != ""
(non-lot stock — the vast majority of rows — carries batch_key = "").

A partial index keyed on (batch_key, qty) and filtered to batch_key <> ''
lets that aggregate touch only the handful of real lot rows and resolve the
GROUP BY / SUM from the index, instead of scanning the whole balances table
on every default Lot page load (status defaults to "active"). Pairs with the
query-side fix that stopped casting Batch.id to text (which defeated the PK
index on the outer predicate).

Index-only change: no behavior change, no API/contract change.

Revision ID: d7f9b1a3c5e2
Revises: d3e5f7a9b1c2
Create Date: 2026-07-22
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'd7f9b1a3c5e2'
down_revision: Union[str, None] = 'd3e5f7a9b1c2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_stock_balances_lot_key "
        "ON stock_balances (batch_key, qty) WHERE batch_key <> ''"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_stock_balances_lot_key")
