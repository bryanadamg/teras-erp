"""add loom prep status to work centers

Loom prep walk on the weaving monitor: IDLE → STAGED → DRAW_IN → TUNING →
RUNNING. Only the two manual steps (Draw-in / Tuning) are stored; IDLE/STAGED
are derived from mounted beams and RUNNING from the active weaving run, so no
backfill is needed — every existing loom resolves to IDLE/STAGED/RUNNING on its
own.

Revision ID: e5a7c9b1d3f6
Revises: d3f5a7c9e1b4
Create Date: 2026-08-06
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e5a7c9b1d3f6'
down_revision: Union[str, None] = 'd3f5a7c9e1b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('work_centers', sa.Column('prep_status', sa.String(length=16), nullable=True))
    op.add_column('work_centers', sa.Column('prep_status_at', sa.DateTime(), nullable=True))
    op.add_column('work_centers', sa.Column('prep_status_by', sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column('work_centers', 'prep_status_by')
    op.drop_column('work_centers', 'prep_status_at')
    op.drop_column('work_centers', 'prep_status')
