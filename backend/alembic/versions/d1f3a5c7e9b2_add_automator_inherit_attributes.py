"""add inherit_attributes to bom_automator_profiles

Revision ID: d1f3a5c7e9b2
Revises: c9e1a3b5d7f2
Create Date: 2026-07-26

Per-level "inherit the root BOM's attribute values" flags for the BOM Automator,
stored parallel to `levels`. Nullable so profiles saved before this migration keep
working — a null reads as "no level inherits", which matches the new default.
"""
from alembic import op
import sqlalchemy as sa


revision = 'd1f3a5c7e9b2'
down_revision = 'c9e1a3b5d7f2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('bom_automator_profiles', sa.Column('inherit_attributes', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('bom_automator_profiles', 'inherit_attributes')
