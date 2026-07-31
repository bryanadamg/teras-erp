"""add print_templates

Client-editable print layouts. One row per document type; absence of a row means
the built-in default layout is used, so there is nothing to backfill — an empty
table reproduces today's printouts exactly.

Revision ID: b2d4f6a8c0e1
Revises: a1c3e5b7d9f2
Create Date: 2026-08-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'b2d4f6a8c0e1'
down_revision: Union[str, None] = 'a1c3e5b7d9f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'print_templates',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('doc_type', sa.String(length=64), nullable=False),
        sa.Column('layout', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('paper', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('updated_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['updated_by_id'], ['users.id'], name='fk_print_templates_updated_by_id_users'),
        sa.PrimaryKeyConstraint('id', name='pk_print_templates'),
        sa.UniqueConstraint('doc_type', name='uq_print_templates_doc_type'),
    )
    op.create_index('ix_print_templates_doc_type', 'print_templates', ['doc_type'])


def downgrade() -> None:
    op.drop_index('ix_print_templates_doc_type', table_name='print_templates')
    op.drop_table('print_templates')
