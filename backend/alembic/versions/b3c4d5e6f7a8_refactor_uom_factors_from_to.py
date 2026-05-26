"""refactor uom_factors from_to

Revision ID: b3c4d5e6f7a8
Revises: a8b2c3d4e5f6
Create Date: 2026-05-26

Replaces uom_id+label with from_uom_id+to_uom_id for explicit source→target conversion.
Existing rows are deleted (data must be re-entered).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'b3c4d5e6f7a8'
down_revision = 'a8b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("DELETE FROM item_uom_factors")
    op.execute("DELETE FROM uom_factors")

    op.add_column('uom_factors', sa.Column('from_uom_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('uom_factors', sa.Column('to_uom_id', postgresql.UUID(as_uuid=True), nullable=True))

    op.create_foreign_key('fk_uom_factors_from_uom', 'uom_factors', 'uoms', ['from_uom_id'], ['id'], ondelete='CASCADE')
    op.create_foreign_key('fk_uom_factors_to_uom', 'uom_factors', 'uoms', ['to_uom_id'], ['id'], ondelete='CASCADE')
    op.create_index('ix_uom_factors_from_uom_id', 'uom_factors', ['from_uom_id'])
    op.create_index('ix_uom_factors_to_uom_id', 'uom_factors', ['to_uom_id'])

    op.alter_column('uom_factors', 'from_uom_id', nullable=False)
    op.alter_column('uom_factors', 'to_uom_id', nullable=False)

    op.drop_constraint('uom_factors_uom_id_fkey', 'uom_factors', type_='foreignkey')
    op.drop_index('ix_uom_factors_uom_id', table_name='uom_factors')
    op.drop_column('uom_factors', 'uom_id')
    op.drop_column('uom_factors', 'label')


def downgrade():
    op.add_column('uom_factors', sa.Column('uom_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('uom_factors', sa.Column('label', sa.String(64), nullable=True))
    op.create_foreign_key('uom_factors_uom_id_fkey', 'uom_factors', 'uoms', ['uom_id'], ['id'], ondelete='CASCADE')
    op.create_index('ix_uom_factors_uom_id', 'uom_factors', ['uom_id'])

    op.drop_constraint('fk_uom_factors_from_uom', 'uom_factors', type_='foreignkey')
    op.drop_constraint('fk_uom_factors_to_uom', 'uom_factors', type_='foreignkey')
    op.drop_index('ix_uom_factors_from_uom_id', table_name='uom_factors')
    op.drop_index('ix_uom_factors_to_uom_id', table_name='uom_factors')
    op.drop_column('uom_factors', 'from_uom_id')
    op.drop_column('uom_factors', 'to_uom_id')
