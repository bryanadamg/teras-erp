"""add reject qc fields to mo_completions and batches

Revision ID: b5d7f9a1c3e5
Revises: f83153735558
Create Date: 2026-07-05

QC rejects: a produced lot can be rejected after weaving — the completion is
flagged (progress returns to the MO) and the output lot is marked REJECTED
(excluded from good-stock netting and consumption pickers).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'b5d7f9a1c3e5'
down_revision: Union[str, None] = 'f83153735558'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('mo_completions', sa.Column('rejected', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    op.add_column('mo_completions', sa.Column('reject_reason', sa.String(length=512), nullable=True))
    op.add_column('mo_completions', sa.Column('rejected_at', sa.DateTime(), nullable=True))
    op.add_column('mo_completions', sa.Column('rejected_by', sa.String(length=128), nullable=True))
    op.add_column('mo_completions', sa.Column('output_batch_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        'fk_mo_completions_output_batch', 'mo_completions', 'batches',
        ['output_batch_id'], ['id'], ondelete='SET NULL',
    )
    op.create_index('ix_mo_completions_output_batch_id', 'mo_completions', ['output_batch_id'])
    op.add_column('batches', sa.Column('quality_status', sa.String(length=16), nullable=False, server_default='GOOD'))


def downgrade() -> None:
    op.drop_column('batches', 'quality_status')
    op.drop_index('ix_mo_completions_output_batch_id', table_name='mo_completions')
    op.drop_constraint('fk_mo_completions_output_batch', 'mo_completions', type_='foreignkey')
    op.drop_column('mo_completions', 'output_batch_id')
    op.drop_column('mo_completions', 'rejected_by')
    op.drop_column('mo_completions', 'rejected_at')
    op.drop_column('mo_completions', 'reject_reason')
    op.drop_column('mo_completions', 'rejected')
