"""add output_location_id to mo_completions

Revision ID: c7e9a1b3d5f7
Revises: b5d7f9a1c3e5
Create Date: 2026-07-05

Dynamic putaway: the completion payload can override the WO's output location
with an operator-chosen bin. Record where the output was actually booked so
un-lotted rejects pull stock back from the right location.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'c7e9a1b3d5f7'
down_revision: Union[str, None] = 'b5d7f9a1c3e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('mo_completions', sa.Column('output_location_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        'fk_mo_completions_output_location', 'mo_completions', 'locations',
        ['output_location_id'], ['id'], ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_mo_completions_output_location', 'mo_completions', type_='foreignkey')
    op.drop_column('mo_completions', 'output_location_id')
