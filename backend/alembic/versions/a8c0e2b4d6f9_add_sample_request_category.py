"""add category to sample_requests

Client-requested classification on the sample request header: NEW_SAMPLE (first-time
development), RE_SAMPLE (redo/repeat of a prior sample), YARDAGE (bulk yardage, not a
swatch). Plain enum column, not a system attribute — closed set, no variant meaning.
Existing rows backfill to NEW_SAMPLE.

Revision ID: a8c0e2b4d6f9
Revises: f4a6c8e0b2d1
Create Date: 2026-08-06
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'a8c0e2b4d6f9'
down_revision: Union[str, Sequence[str], None] = 'f4a6c8e0b2d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c['name'] for c in sa.inspect(bind).get_columns('sample_requests')}
    if 'category' not in cols:
        op.add_column(
            'sample_requests',
            sa.Column('category', sa.String(16), nullable=False, server_default='NEW_SAMPLE'),
        )
        op.create_index('ix_sample_requests_category', 'sample_requests', ['category'])


def downgrade() -> None:
    op.drop_index('ix_sample_requests_category', table_name='sample_requests')
    op.drop_column('sample_requests', 'category')
