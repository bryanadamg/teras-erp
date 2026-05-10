"""add_work_order_id_to_mo_completions

Revision ID: db1bb5dfc21d
Revises: badce8f1a27f
Create Date: 2026-05-10 07:56:07.631597

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'db1bb5dfc21d'
down_revision: Union[str, None] = 'badce8f1a27f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('mo_completions',
        sa.Column('work_order_id', postgresql.UUID(as_uuid=True), nullable=True)
    )
    op.create_index(
        op.f('ix_mo_completions_work_order_id'), 'mo_completions', ['work_order_id'], unique=False
    )
    op.create_foreign_key(
        op.f('fk_mo_completions_work_order_id_work_orders'),
        'mo_completions', 'work_orders',
        ['work_order_id'], ['id'],
        ondelete='SET NULL'
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f('fk_mo_completions_work_order_id_work_orders'), 'mo_completions', type_='foreignkey'
    )
    op.drop_index(op.f('ix_mo_completions_work_order_id'), table_name='mo_completions')
    op.drop_column('mo_completions', 'work_order_id')
