"""add cones/boxes packaging tallies to mo_completions

Revision ID: d9f1b3c5e7a0
Revises: c2e4a6b8d0f1
Create Date: 2026-07-18

"""
from alembic import op
import sqlalchemy as sa


revision = "d9f1b3c5e7a0"
down_revision = "c2e4a6b8d0f1"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("mo_completions", sa.Column("qty_cones", sa.Integer(), nullable=True))
    op.add_column("mo_completions", sa.Column("qty_boxes", sa.Integer(), nullable=True))


def downgrade():
    op.drop_column("mo_completions", "qty_boxes")
    op.drop_column("mo_completions", "qty_cones")
