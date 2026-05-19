"""add bom_operation_id to bom_lines

Revision ID: d1e2f3a4b5c6
Revises: c8f2e9a1b3d5
Create Date: 2026-05-19 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'd1e2f3a4b5c6'
down_revision: Union[str, None] = 'c8f2e9a1b3d5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE bom_lines ADD COLUMN IF NOT EXISTS bom_operation_id UUID")
    op.execute("CREATE INDEX IF NOT EXISTS ix_bom_lines_bom_operation_id ON bom_lines (bom_operation_id)")
    op.execute("ALTER TABLE bom_lines DROP CONSTRAINT IF EXISTS fk_bom_lines_bom_operation_id")
    op.execute(
        "ALTER TABLE bom_lines ADD CONSTRAINT fk_bom_lines_bom_operation_id "
        "FOREIGN KEY (bom_operation_id) REFERENCES bom_operations(id) ON DELETE SET NULL"
    )
    op.execute("ALTER TABLE mo_planned_components ADD COLUMN IF NOT EXISTS bom_operation_id UUID")
    op.execute("ALTER TABLE mo_planned_components DROP CONSTRAINT IF EXISTS fk_mo_planned_components_bom_operation_id")
    op.execute(
        "ALTER TABLE mo_planned_components ADD CONSTRAINT fk_mo_planned_components_bom_operation_id "
        "FOREIGN KEY (bom_operation_id) REFERENCES bom_operations(id) ON DELETE SET NULL"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE mo_planned_components DROP CONSTRAINT IF EXISTS fk_mo_planned_components_bom_operation_id")
    op.execute("ALTER TABLE mo_planned_components DROP COLUMN IF EXISTS bom_operation_id")
    op.execute("ALTER TABLE bom_lines DROP CONSTRAINT IF EXISTS fk_bom_lines_bom_operation_id")
    op.execute("DROP INDEX IF EXISTS ix_bom_lines_bom_operation_id")
    op.execute("ALTER TABLE bom_lines DROP COLUMN IF EXISTS bom_operation_id")
