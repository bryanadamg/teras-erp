"""3-level location hierarchy: warehouse -> zone -> bin; system-defined stores

Revision ID: b1c2d3e4f5a6
Revises: a9c1e3b5d7f0
Create Date: 2026-06-29

Changes:
- Add location_type VARCHAR(10): 'warehouse' | 'zone' | 'bin'
- Backfill: top-level rows -> 'warehouse', existing child rows -> 'zone'
  (existing spots become zones; they remain leaf-valid until bins are added)
- Add system_code VARCHAR(32): unique partial index; marks non-editable seeded stores
"""
from typing import Sequence, Union
from alembic import op


revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, None] = 'b1c3e5a7f9d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE locations ADD COLUMN IF NOT EXISTS location_type VARCHAR(10) NOT NULL DEFAULT 'bin'")
    op.execute("UPDATE locations SET location_type = 'warehouse' WHERE parent_id IS NULL")
    op.execute("UPDATE locations SET location_type = 'zone' WHERE parent_id IS NOT NULL")
    op.execute("ALTER TABLE locations ADD COLUMN IF NOT EXISTS system_code VARCHAR(32)")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_locations_system_code ON locations (system_code) "
        "WHERE system_code IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_locations_system_code")
    op.execute("ALTER TABLE locations DROP COLUMN IF EXISTS system_code")
    op.execute("ALTER TABLE locations DROP COLUMN IF EXISTS location_type")
