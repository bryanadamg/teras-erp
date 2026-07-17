"""labdip item rejection_reason and rejection_notes

Revision ID: a1c4e7b90f22
Revises: ec56082f1198
Create Date: 2026-07-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1c4e7b90f22'
down_revision: Union[str, None] = 'ec56082f1198'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('lab_dip_items', sa.Column('rejection_reason', sa.String(length=255), nullable=True))
    op.add_column('lab_dip_items', sa.Column('rejection_notes', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('lab_dip_items', 'rejection_notes')
    op.drop_column('lab_dip_items', 'rejection_reason')
