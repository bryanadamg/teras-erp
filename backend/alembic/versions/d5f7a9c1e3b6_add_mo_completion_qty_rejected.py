"""add mo_completions.qty_rejected (durable rejected-output qty for MO yield)

Rejected output had no durable home. A whole-lot reject only flips
`rejected=True` (the qty stayed readable on qty_completed), but a PARTIAL reject
subtracts the rejected amount from `qty_completed` so progress sums stay correct
— leaving the scrapped qty recorded nowhere except the split-off `-R{n}` sub-lot's
stock balance, which goes to zero the moment that lot is disposed. MO effectivity
("100kg target, 100kg good, 5kg reject") was therefore unreportable.

`qty_rejected` is that record: both reject paths (`POST /batches/{id}/reject` and
the completion-level `POST /manufacturing-orders/{mo}/completions/{id}/reject`)
now add the scrapped qty here. Yield = qty_completed / (qty_completed + qty_rejected).

Backfill: existing whole-lot rejects are recoverable — `rejected=True` rows kept
their original logged qty on `qty_completed`, so that value IS the rejected qty.
Historical PARTIAL rejects cannot be backfilled (the amount was subtracted in
place and only the audit log holds it); they stay 0.

Revision ID: d5f7a9c1e3b6
Revises: c3e5a7b9d1f4
Create Date: 2026-07-31
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd5f7a9c1e3b6'
down_revision: Union[str, None] = 'c3e5a7b9d1f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'mo_completions',
        sa.Column('qty_rejected', sa.Numeric(14, 4), nullable=False, server_default='0'),
    )
    # Whole-lot rejects: the logged qty is the rejected qty.
    op.execute("""
        UPDATE mo_completions
           SET qty_rejected = qty_completed
         WHERE rejected IS TRUE
           AND qty_completed > 0
    """)


def downgrade() -> None:
    op.drop_column('mo_completions', 'qty_rejected')
