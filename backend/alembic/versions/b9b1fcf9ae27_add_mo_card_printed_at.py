"""add_mo_card_printed_at

Revision ID: b9b1fcf9ae27
Revises: e9b1d3f5a7c2
Create Date: 2026-08-02 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'b9b1fcf9ae27'
down_revision: Union[str, None] = 'e9b1d3f5a7c2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('manufacturing_orders', sa.Column('card_printed_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('manufacturing_orders', 'card_printed_at')
