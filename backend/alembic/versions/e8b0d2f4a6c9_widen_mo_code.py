"""widen manufacturing_orders.code to 128

MO codes are composed, not sequential: PR creation builds them from the PR code,
the entry index and the size label, and `mrp_service` builds them from the item
name. varchar(64) was one long recipe/size name away from breaking, and it did —
a 3-BOM Production Run over combo recipes produced a 78-char code and failed the
whole create with StringDataRightTruncationError, rolling back every MO in the run.

128 matches `work_orders.code`, which is derived from this column (`{mo.code}-WO-NN`)
and was already 128 — the two were inconsistent. In Postgres varchar(n) has no
storage or lookup advantage over a longer varchar, so the narrow cap bought nothing
but that failure mode. Composition-side clamps stay in place as defense in depth.

Revision ID: e8b0d2f4a6c9
Revises: a3c5e7b9d1f4
"""
from alembic import op
import sqlalchemy as sa

revision = 'e8b0d2f4a6c9'
down_revision = 'a3c5e7b9d1f4'
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column(
        'manufacturing_orders', 'code',
        existing_type=sa.String(length=64),
        type_=sa.String(length=128),
        existing_nullable=False,
    )


def downgrade():
    # Narrowing back can only succeed while every code still fits 64 chars; any
    # code minted after upgrade may not, so this fails loudly rather than truncating.
    op.alter_column(
        'manufacturing_orders', 'code',
        existing_type=sa.String(length=128),
        type_=sa.String(length=64),
        existing_nullable=False,
    )
