"""labdip item approved_set and approved_color

Revision ID: ec56082f1198
Revises: d8e0f2a4c6b9
Create Date: 2026-07-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'ec56082f1198'
down_revision: Union[str, None] = 'd8e0f2a4c6b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('lab_dip_items', sa.Column('approved_set', sa.String(length=64), nullable=True))
    op.add_column('lab_dip_items', sa.Column('approved_color_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index(op.f('ix_lab_dip_items_approved_color_id'), 'lab_dip_items', ['approved_color_id'], unique=False)
    op.create_foreign_key(
        'fk_lab_dip_items_approved_color_id_colors',
        'lab_dip_items', 'colors',
        ['approved_color_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_lab_dip_items_approved_color_id_colors', 'lab_dip_items', type_='foreignkey')
    op.drop_index(op.f('ix_lab_dip_items_approved_color_id'), table_name='lab_dip_items')
    op.drop_column('lab_dip_items', 'approved_color_id')
    op.drop_column('lab_dip_items', 'approved_set')
