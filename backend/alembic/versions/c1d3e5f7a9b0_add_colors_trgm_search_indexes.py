"""add pg_trgm GIN indexes for colors typeahead search

The Color Library typeahead (SO color picker, Color Library page) filters with
leading-wildcard ILIKE ('%search%') on code/name/pantone_ref/customer_color_code.
Leading wildcards can't use a plain B-tree index, so every keystroke forced a
seq scan across the ~30k-row colors table. GIN trigram indexes make ILIKE
'%...%' index-backed instead.

Revision ID: c1d3e5f7a9b0
Revises: b6d8f0a2c4e6
Create Date: 2026-07-20
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'c1d3e5f7a9b0'
down_revision: Union[str, None] = 'b6d8f0a2c4e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_INDEXES = [
    ("ix_colors_code_trgm", "code"),
    ("ix_colors_name_trgm", "name"),
    ("ix_colors_pantone_ref_trgm", "pantone_ref"),
    ("ix_colors_customer_color_code_trgm", "customer_color_code"),
]


def upgrade() -> None:
    op.execute('CREATE EXTENSION IF NOT EXISTS pg_trgm')
    for name, column in _INDEXES:
        op.execute(
            f'CREATE INDEX IF NOT EXISTS {name} ON colors USING gin ({column} gin_trgm_ops)'
        )


def downgrade() -> None:
    for name, _column in _INDEXES:
        op.execute(f'DROP INDEX IF EXISTS {name}')
