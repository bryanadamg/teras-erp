"""add_contact_fields_to_partners

Revision ID: c8d9e0f1a2b3
Revises: b7c8d9e0f1a2
Create Date: 2026-06-14 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'c8d9e0f1a2b3'
down_revision: Union[str, None] = 'b7c8d9e0f1a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('partners', sa.Column('contact_person', sa.String(255), nullable=True))
    op.add_column('partners', sa.Column('phone', sa.String(64), nullable=True))
    op.add_column('partners', sa.Column('fax', sa.String(64), nullable=True))
    op.add_column('partners', sa.Column('email', sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column('partners', 'email')
    op.drop_column('partners', 'fax')
    op.drop_column('partners', 'phone')
    op.drop_column('partners', 'contact_person')
