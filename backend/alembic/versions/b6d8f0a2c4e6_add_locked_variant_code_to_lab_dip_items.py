"""add locked_variant_code to lab_dip_items

Revision ID: b6d8f0a2c4e6
Revises: a4c6e8b0d2f4
Create Date: 2026-07-20

Lets a resubmitted (new-request) lab dip item keep the exact variant code
(e.g. "00003-A") of the rejected item it replaces, overriding the normally
derived request-seq + letter code (see _decorate() in api/lab_dips.py).
"""
from alembic import op
import sqlalchemy as sa


revision = "b6d8f0a2c4e6"
down_revision = "a4c6e8b0d2f4"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("lab_dip_items", sa.Column("locked_variant_code", sa.String(length=32), nullable=True))


def downgrade():
    op.drop_column("lab_dip_items", "locked_variant_code")
