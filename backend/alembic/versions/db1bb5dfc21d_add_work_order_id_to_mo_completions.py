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
    op.execute("ALTER TABLE mo_completions ADD COLUMN IF NOT EXISTS work_order_id UUID")
    op.execute("CREATE INDEX IF NOT EXISTS ix_mo_completions_work_order_id ON mo_completions (work_order_id)")
    op.execute("ALTER TABLE mo_completions DROP CONSTRAINT IF EXISTS fk_mo_completions_work_order_id_work_orders")
    op.execute("""
        ALTER TABLE mo_completions
        ADD CONSTRAINT fk_mo_completions_work_order_id_work_orders
        FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE SET NULL
    """)


def downgrade() -> None:
    op.drop_constraint(
        op.f('fk_mo_completions_work_order_id_work_orders'), 'mo_completions', type_='foreignkey'
    )
    op.drop_index(op.f('ix_mo_completions_work_order_id'), table_name='mo_completions')
    op.drop_column('mo_completions', 'work_order_id')
