"""add color variant attribute value link

Revision ID: 31be263f5cdb
Revises: d1f3a5c7e9b2
Create Date: 2026-07-28 11:48:29.339589

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '31be263f5cdb'
down_revision: Union[str, None] = 'd1f3a5c7e9b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('colors', sa.Column('variant_attribute_value_id', sa.UUID(), nullable=True))
    op.create_index(op.f('ix_colors_variant_attribute_value_id'), 'colors', ['variant_attribute_value_id'], unique=False)
    op.create_foreign_key(
        op.f('fk_colors_variant_attribute_value_id_attribute_values'),
        'colors', 'attribute_values', ['variant_attribute_value_id'], ['id'], ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint(op.f('fk_colors_variant_attribute_value_id_attribute_values'), 'colors', type_='foreignkey')
    op.drop_index(op.f('ix_colors_variant_attribute_value_id'), table_name='colors')
    op.drop_column('colors', 'variant_attribute_value_id')
