"""add_lab_dip_items

Revision ID: a4d6f8c0e2b4
Revises: c8f0a2d4e6b8
Create Date: 2026-07-17 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = 'a4d6f8c0e2b4'
down_revision: Union[str, None] = 'c8f0a2d4e6b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'lab_dip_items',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('lab_dip_request_id', UUID(as_uuid=True), nullable=False),
        sa.Column('item_id', UUID(as_uuid=True), nullable=False),
        sa.Column('order', sa.Integer(), nullable=False, server_default='0'),
        sa.ForeignKeyConstraint(['lab_dip_request_id'], ['lab_dip_requests.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['item_id'], ['items.id']),
    )
    op.create_index('ix_lab_dip_items_lab_dip_request_id', 'lab_dip_items', ['lab_dip_request_id'])
    op.create_index('ix_lab_dip_items_item_id', 'lab_dip_items', ['item_id'])

    op.add_column('lab_dip_lines', sa.Column('lab_dip_item_id', UUID(as_uuid=True), nullable=True))
    op.create_index('ix_lab_dip_lines_lab_dip_item_id', 'lab_dip_lines', ['lab_dip_item_id'])
    op.create_foreign_key(
        'fk_lab_dip_lines_lab_dip_item_id_lab_dip_items', 'lab_dip_lines', 'lab_dip_items',
        ['lab_dip_item_id'], ['id'], ondelete='CASCADE',
    )


def downgrade() -> None:
    op.drop_constraint('fk_lab_dip_lines_lab_dip_item_id_lab_dip_items', 'lab_dip_lines', type_='foreignkey')
    op.drop_index('ix_lab_dip_lines_lab_dip_item_id', table_name='lab_dip_lines')
    op.drop_column('lab_dip_lines', 'lab_dip_item_id')

    op.drop_index('ix_lab_dip_items_item_id', table_name='lab_dip_items')
    op.drop_index('ix_lab_dip_items_lab_dip_request_id', table_name='lab_dip_items')
    op.drop_table('lab_dip_items')
