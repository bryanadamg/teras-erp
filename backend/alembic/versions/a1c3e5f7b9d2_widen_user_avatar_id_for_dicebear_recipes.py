"""widen user avatar_id for dicebear recipes

Avatars moved from ten hand-drawn sprites (avatar_id held '1'..'10') to DiceBear
pixel-art recipes: a seed plus per-slot overrides, e.g.
"v1|bryan|ht:variant03|sk:8d5524". Those need room.

Legacy values are left in place rather than migrated — the old sprites no longer
exist, so there is nothing to map them onto. The frontend treats any value that
isn't a "v1|" recipe as unset and seeds from the username instead, which gives
every existing user a stable distinct avatar without a data backfill.

Revision ID: a1c3e5f7b9d2
Revises: d6671093a6cb
Create Date: 2026-08-27

"""
from alembic import op
import sqlalchemy as sa


revision = 'a1c3e5f7b9d2'
down_revision = 'd6671093a6cb'
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column(
        'users',
        'avatar_id',
        existing_type=sa.String(length=4),
        type_=sa.String(length=255),
        existing_nullable=True,
    )


def downgrade():
    # Recipes are far longer than 4 chars, so anything written since the upgrade
    # cannot survive the narrowing. Drop those values instead of letting the
    # column alter fail on existing rows; the frontend re-seeds from username.
    op.execute("UPDATE users SET avatar_id = NULL WHERE length(avatar_id) > 4")
    op.alter_column(
        'users',
        'avatar_id',
        existing_type=sa.String(length=255),
        type_=sa.String(length=4),
        existing_nullable=True,
    )
