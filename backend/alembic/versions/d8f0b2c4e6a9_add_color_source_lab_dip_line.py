"""add Color.source_lab_dip_line_id lineage FK

PLM lineage from an approved LabDip dip line to the Color it spawned (mirrors
Item.source_color_id). Nullable -> no backfill. lab_dip_lines.color_id already
points the other way; both FKs are nullable so the mutual reference is fine.

Revision ID: d8f0b2c4e6a9
Revises: c6e8a0b2d4f6
Create Date: 2026-06-28
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = 'd8f0b2c4e6a9'
down_revision: Union[str, None] = 'c6e8a0b2d4f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('colors', sa.Column('source_lab_dip_line_id', UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        'fk_colors_source_lab_dip_line_id_lab_dip_lines', 'colors', 'lab_dip_lines',
        ['source_lab_dip_line_id'], ['id'], ondelete='SET NULL',
    )
    op.create_index('ix_colors_source_lab_dip_line_id', 'colors', ['source_lab_dip_line_id'])


def downgrade() -> None:
    op.drop_index('ix_colors_source_lab_dip_line_id', table_name='colors')
    op.drop_constraint('fk_colors_source_lab_dip_line_id_lab_dip_lines', 'colors', type_='foreignkey')
    op.drop_column('colors', 'source_lab_dip_line_id')
