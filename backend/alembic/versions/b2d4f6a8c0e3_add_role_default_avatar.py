"""add role default avatar template

Roles get a default avatar *template*: a DiceBear recipe whose pinned slots
(no hat, no accessories, formal clothing) apply to every user in the role who
hasn't saved an avatar of their own. The template's own seed is ignored — each
user keeps their username seed — so a role sets a dress code without giving
every director the same face.

Same column width as users.avatar_id, and the same rule: the frontend is the
authority on recipe contents and drops anything it doesn't recognise.

Revision ID: b2d4f6a8c0e3
Revises: a1c3e5f7b9d2
"""
from alembic import op
import sqlalchemy as sa

revision = 'b2d4f6a8c0e3'
down_revision = 'a1c3e5f7b9d2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('roles', sa.Column('default_avatar_id', sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column('roles', 'default_avatar_id')
