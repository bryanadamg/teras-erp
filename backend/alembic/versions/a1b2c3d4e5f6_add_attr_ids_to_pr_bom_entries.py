"""add attribute_value_ids to pr_bom_entries

Revision ID: a1b2c3d4e5f6
Revises: a7f3c1b2d4e5
Create Date: 2026-05-17 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'a7f3c1b2d4e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE pr_bom_entries ADD COLUMN IF NOT EXISTS "
        "attribute_value_ids JSONB NOT NULL DEFAULT '[]'"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE pr_bom_entries DROP COLUMN IF EXISTS attribute_value_ids")
