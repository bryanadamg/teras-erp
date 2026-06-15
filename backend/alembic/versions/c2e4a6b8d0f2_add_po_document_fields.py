"""add purchase order document fields (ssn, rate, kurs, code, payment, category, vat, discount)

These were previously entered at print-preview time and persisted only in browser
localStorage. They now belong to the PurchaseOrder record so they are captured once
at PO creation and rendered on every printout. All columns are nullable (additive,
backfill-free) — existing POs simply have NULLs and the print modal falls back to
empty/default values.

Revision ID: c2e4a6b8d0f2
Revises: f9a1c2d3e4b5
Create Date: 2026-06-15
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'c2e4a6b8d0f2'
down_revision: Union[str, None] = 'f9a1c2d3e4b5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_COLUMNS = [
    ("ssn", sa.String(length=128)),
    ("rate_mode", sa.String(length=16)),
    ("kurs_pajak", sa.String(length=64)),
    ("ktbi", sa.String(length=64)),
    ("code", sa.String(length=64)),
    ("payment_term", sa.String(length=128)),
    ("category", sa.String(length=64)),
    ("vat_percent", sa.Numeric(6, 2)),
    ("discount", sa.Numeric(14, 2)),
]


def upgrade() -> None:
    for name, type_ in _COLUMNS:
        op.add_column("purchase_orders", sa.Column(name, type_, nullable=True))


def downgrade() -> None:
    for name, _ in reversed(_COLUMNS):
        op.drop_column("purchase_orders", name)
