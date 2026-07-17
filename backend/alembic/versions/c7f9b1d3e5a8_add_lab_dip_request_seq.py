"""add_lab_dip_request_seq

Revision ID: c7f9b1d3e5a8
Revises: b6e8a0c2d4f7
Create Date: 2026-07-17 01:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'c7f9b1d3e5a8'
down_revision: Union[str, None] = 'b6e8a0c2d4f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE SEQUENCE IF NOT EXISTS lab_dip_request_seq")
    # Seed so the next value is (highest existing sequence + 1); is_called=false makes
    # the first nextval() return that value rather than one past it.
    op.execute("""
        SELECT setval(
            'lab_dip_request_seq',
            COALESCE((SELECT MAX(substring(code from '[0-9]+$')::int) FROM lab_dip_requests), 0) + 1,
            false
        )
    """)


def downgrade() -> None:
    op.execute("DROP SEQUENCE IF EXISTS lab_dip_request_seq")
