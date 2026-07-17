"""add CIELAB (L*a*b*) fields to colors

Revision ID: c2e4a6b8d0f1
Revises: a1c4e7b90f22
Create Date: 2026-07-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c2e4a6b8d0f1'
down_revision: Union[str, None] = 'a1c4e7b90f22'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('colors', sa.Column('l_star', sa.Float(), nullable=True))
    op.add_column('colors', sa.Column('a_star', sa.Float(), nullable=True))
    op.add_column('colors', sa.Column('b_star', sa.Float(), nullable=True))
    op.add_column('colors', sa.Column('lab_illuminant', sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column('colors', 'lab_illuminant')
    op.drop_column('colors', 'b_star')
    op.drop_column('colors', 'a_star')
    op.drop_column('colors', 'l_star')
