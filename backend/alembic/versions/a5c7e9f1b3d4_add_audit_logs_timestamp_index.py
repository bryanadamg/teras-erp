"""add standalone timestamp index on audit_logs

The only index on audit_logs was the composite (entity_type, entity_id,
timestamp) added in f9a1c2d3e4b5, built for entity-scoped history lookups.
The Admin > Audit Logs page browses ALL entities (no entity_type/entity_id
filter), so it hits a plain `ORDER BY timestamp DESC OFFSET ... LIMIT ...`
with no usable index -> seq scan + sort, worsening as the (unbounded, every
mutation writes here) table grows. Adds the missing single-column index.

Index-only change: no behavior change, no API/contract change.

Revision ID: a5c7e9f1b3d4
Revises: f2a4c6e8b0d1
Create Date: 2026-07-21
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a5c7e9f1b3d4'
down_revision: Union[str, None] = 'f2a4c6e8b0d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute('CREATE INDEX IF NOT EXISTS ix_audit_logs_timestamp ON audit_logs (timestamp)')


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS ix_audit_logs_timestamp')
