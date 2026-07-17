"""add_lab_dip_item_variant_seq

Revision ID: b6e8a0c2d4f7
Revises: a4d6f8c0e2b4
Create Date: 2026-07-17 00:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'b6e8a0c2d4f7'
down_revision: Union[str, None] = 'a4d6f8c0e2b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('lab_dip_items', sa.Column('variant_seq', sa.Integer(), nullable=False, server_default='0'))
    # Backfill existing rows: stable 0-based index within each request, ordered by "order".
    op.execute("""
        UPDATE lab_dip_items AS t SET variant_seq = sub.rn
        FROM (
            SELECT id, (row_number() OVER (PARTITION BY lab_dip_request_id ORDER BY "order", id) - 1) AS rn
            FROM lab_dip_items
        ) AS sub
        WHERE t.id = sub.id
    """)


def downgrade() -> None:
    op.drop_column('lab_dip_items', 'variant_seq')
