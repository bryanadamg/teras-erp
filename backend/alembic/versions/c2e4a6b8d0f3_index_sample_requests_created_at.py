"""index sample_requests.created_at

The samples list is now server-paginated and ordered (created_at DESC, id DESC).
Without an index that ordering is a seq scan + sort of the whole table on every
page — fine at 130 rows, not at tens of thousands.

Revision ID: c2e4a6b8d0f3
Revises: a8c0e2b4d6f9
Create Date: 2026-08-07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'c2e4a6b8d0f3'
down_revision: Union[str, Sequence[str], None] = 'a8c0e2b4d6f9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    existing = {i['name'] for i in sa.inspect(bind).get_indexes('sample_requests')}
    if 'ix_sample_requests_created_at' not in existing:
        op.create_index(
            'ix_sample_requests_created_at',
            'sample_requests',
            [sa.text('created_at DESC'), sa.text('id DESC')],
        )


def downgrade() -> None:
    op.drop_index('ix_sample_requests_created_at', table_name='sample_requests')
