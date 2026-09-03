"""configurable production quantity formula

The Production Run modal's Apply button turned ordered sizes into sizes to make
with a rule hardcoded in the frontend (S=0, M=(S+M)/2, L=(S+M)/2+L, the rest as
ordered). Store it instead, one expression per size plus a "*" fallback, and
seed exactly that rule so behaviour is unchanged on upgrade.

Revision ID: a8c0e2f4b6d1
Revises: d2f4b6a8c0e7
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'a8c0e2f4b6d1'
down_revision = 'd2f4b6a8c0e7'
branch_labels = None
depends_on = None

DEFAULTS = [
    ('S', '0'),
    ('M', '(S + M) / 2'),
    ('L', '(S + M) / 2 + L'),
    ('*', 'qty'),
]


def upgrade() -> None:
    op.create_table(
        'qty_formula_rules',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('size_name', sa.String(length=16), nullable=False),
        sa.Column('expression', sa.Text(), nullable=False),
        sa.Column('updated_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_qty_formula_rules_size_name', 'qty_formula_rules', ['size_name'], unique=True)

    # Seed the previously hardcoded rule. Done here rather than leaving it to
    # init_db's seeder so the table is never briefly empty on a running box —
    # an empty rule set makes Apply produce blanks.
    for name, expr in DEFAULTS:
        op.execute(
            sa.text(
                "INSERT INTO qty_formula_rules (id, size_name, expression, updated_at) "
                "VALUES (gen_random_uuid(), :n, :e, now()) ON CONFLICT DO NOTHING"
            ).bindparams(n=name, e=expr)
        )


def downgrade() -> None:
    op.drop_index('ix_qty_formula_rules_size_name', table_name='qty_formula_rules')
    op.drop_table('qty_formula_rules')
