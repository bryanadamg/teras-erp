"""snapshot bom size on manufacturing order

Store bom_size spec (size_name, label, measurements) as a JSON snapshot on the MO
at creation time, so BOM edits don't affect in-flight MOs. Change the bom_size_id
FK to ON DELETE SET NULL so deleting a BOMSize row no longer raises a FK violation.

Revision ID: b1d3f5a7c9e2
Revises: f7b9d1e3a5c8
Create Date: 2026-06-28
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = 'b1d3f5a7c9e2'
down_revision: Union[str, None] = 'a9c1e3b5d7f0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('manufacturing_orders', sa.Column('bom_size_snapshot', JSONB, nullable=True))

    # Drop existing FK and recreate with ON DELETE SET NULL
    op.drop_constraint('fk_manufacturing_orders_bom_size_id_bom_sizes', 'manufacturing_orders', type_='foreignkey')
    op.create_foreign_key(
        'fk_manufacturing_orders_bom_size_id_bom_sizes',
        'manufacturing_orders', 'bom_sizes',
        ['bom_size_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_column('manufacturing_orders', 'bom_size_snapshot')

    op.drop_constraint('fk_manufacturing_orders_bom_size_id_bom_sizes', 'manufacturing_orders', type_='foreignkey')
    op.create_foreign_key(
        'fk_manufacturing_orders_bom_size_id_bom_sizes',
        'manufacturing_orders', 'bom_sizes',
        ['bom_size_id'], ['id'],
    )
