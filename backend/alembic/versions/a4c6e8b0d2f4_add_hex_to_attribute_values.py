"""add hex to attribute_values

Revision ID: a4c6e8b0d2f4
Revises: f1d3b5a7c9e2
Create Date: 2026-07-20

Optional stored swatch color for variant attribute values (e.g. "Colors" system
attribute). Lets users pick an exact hex instead of relying on the derived
EN+ID name->hex heuristic (components/shared/xpTheme.tsx colorHexFor).
"""
from alembic import op
import sqlalchemy as sa


revision = "a4c6e8b0d2f4"
down_revision = "f1d3b5a7c9e2"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("attribute_values", sa.Column("hex", sa.String(length=9), nullable=True))


def downgrade():
    op.drop_column("attribute_values", "hex")
