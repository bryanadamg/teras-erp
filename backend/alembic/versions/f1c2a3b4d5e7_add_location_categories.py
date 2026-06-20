"""add location_categories and locations.category_id

Revision ID: f1c2a3b4d5e7
Revises: d7e9f1a2b3c4
Create Date: 2026-06-20 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'f1c2a3b4d5e7'
down_revision: Union[str, None] = 'd7e9f1a2b3c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS location_categories (
            id UUID PRIMARY KEY,
            name VARCHAR(128) NOT NULL
        )
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_location_categories_name "
        "ON location_categories (name)"
    )
    op.execute("ALTER TABLE locations ADD COLUMN IF NOT EXISTS category_id UUID")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_locations_category_id "
        "ON locations (category_id)"
    )
    op.execute(
        "ALTER TABLE locations "
        "DROP CONSTRAINT IF EXISTS fk_locations_category_id_location_categories"
    )
    op.execute(
        """
        ALTER TABLE locations
        ADD CONSTRAINT fk_locations_category_id_location_categories
        FOREIGN KEY (category_id) REFERENCES location_categories(id) ON DELETE SET NULL
        """
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE locations "
        "DROP CONSTRAINT IF EXISTS fk_locations_category_id_location_categories"
    )
    op.execute("DROP INDEX IF EXISTS ix_locations_category_id")
    op.execute("ALTER TABLE locations DROP COLUMN IF EXISTS category_id")
    op.execute("DROP INDEX IF EXISTS ix_location_categories_name")
    op.execute("DROP TABLE IF EXISTS location_categories")
