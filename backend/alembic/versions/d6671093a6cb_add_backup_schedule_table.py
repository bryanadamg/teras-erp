"""add backup_schedule table

Revision ID: d6671093a6cb
Revises: c8e0a2b4d6f9
Create Date: 2026-08-27 00:25:25.540700

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'd6671093a6cb'
down_revision: Union[str, None] = 'c8e0a2b4d6f9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'backup_schedule',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('enabled', sa.Boolean(), nullable=False),
        sa.Column('frequency', sa.String(length=10), nullable=False),
        sa.Column('day_of_week', sa.Integer(), nullable=True),
        sa.Column('hour', sa.Integer(), nullable=False),
        sa.Column('minute', sa.Integer(), nullable=False),
        sa.Column('timezone', sa.String(length=64), nullable=False),
        sa.Column('retain_count', sa.Integer(), nullable=False),
        sa.Column('last_run_at', sa.DateTime(), nullable=True),
        sa.Column('last_run_status', sa.String(length=10), nullable=True),
        sa.Column('last_run_error', sa.Text(), nullable=True),
        sa.Column('updated_by_id', sa.UUID(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['updated_by_id'], ['users.id'], name=op.f('fk_backup_schedule_updated_by_id_users')),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_backup_schedule')),
    )


def downgrade() -> None:
    op.drop_table('backup_schedule')
