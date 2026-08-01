"""add lab_dip_requests.kind and the yarn request sequence

Splits lab dip requests into two independent numbering books:
  FG   → LD-YYYY-#####   (lab_dip_request_seq, existing)
  YARN → LDY-YYYY-##### (lab_dip_yarn_request_seq, new)

Also merges the two pre-existing Alembic heads (b9b1fcf9ae27 and d5f7b9a1c3e2)
so `alembic upgrade head` resolves to a single revision again.

Revision ID: e3b5d7f9a1c4
Revises: b9b1fcf9ae27, d5f7b9a1c3e2
Create Date: 2026-08-02
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e3b5d7f9a1c4'
down_revision: Union[str, Sequence[str], None] = ('b9b1fcf9ae27', 'd5f7b9a1c3e2')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Every existing request is a finished-goods one; server_default backfills them
    # in the same statement, and is kept so plain SQL inserts stay valid.
    op.add_column(
        'lab_dip_requests',
        sa.Column('kind', sa.String(length=8), nullable=False, server_default='FG'),
    )
    op.create_index('ix_lab_dip_requests_kind', 'lab_dip_requests', ['kind'])

    # Yarn numbering starts fresh at 1 — deliberately independent of the FG series.
    op.execute("CREATE SEQUENCE IF NOT EXISTS lab_dip_yarn_request_seq")


def downgrade() -> None:
    op.execute("DROP SEQUENCE IF EXISTS lab_dip_yarn_request_seq")
    op.drop_index('ix_lab_dip_requests_kind', table_name='lab_dip_requests')
    op.drop_column('lab_dip_requests', 'kind')
