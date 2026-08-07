"""sample request category becomes a system attribute value

The category was a closed 3-value enum on the header (NEW_SAMPLE / RE_SAMPLE /
YARDAGE). It now points at an AttributeValue of the new `Sample Category` system
attribute (system_role='sample_category') so users can curate their own
categories on the Attributes page, with `category` kept as a display snapshot of
the picked value.

Upgrade seeds the attribute + the three defaults, rewrites the legacy enum keys
to their display labels and links every row to its value.

Revision ID: d4f6a8c0e2b7
Revises: c2e4a6b8d0f3
Create Date: 2026-08-07
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'd4f6a8c0e2b7'
down_revision: Union[str, Sequence[str], None] = 'c2e4a6b8d0f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ATTR_NAME = "Sample Category"
ROLE = "sample_category"
# legacy enum key -> display label (also the seeded attribute value)
LEGACY = {
    "NEW_SAMPLE": "New Sample",
    "RE_SAMPLE": "Re Sample",
    "YARDAGE": "Yardage",
}


def upgrade() -> None:
    # snapshot widens: values are user-authored text now, not an enum key
    op.alter_column(
        'sample_requests', 'category',
        existing_type=sa.String(16), type_=sa.String(64),
        existing_nullable=False, server_default='New Sample',
    )
    op.add_column('sample_requests', sa.Column('category_value_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_sample_requests_category_value_id", 'sample_requests', "attribute_values",
        ["category_value_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index('ix_sample_requests_category_value_id', 'sample_requests', ['category_value_id'])

    conn = op.get_bind()

    # 1. ensure the system attribute exists (init_db seeds it too; idempotent here so
    #    the backfill below can run on the very first upgrade)
    attr_id = conn.execute(
        sa.text("SELECT id FROM attributes WHERE name = :n OR system_role = :r LIMIT 1"),
        {"n": ATTR_NAME, "r": ROLE},
    ).scalar()
    if not attr_id:
        attr_id = conn.execute(
            sa.text(
                "INSERT INTO attributes (id, name, is_system, system_role) "
                "VALUES (gen_random_uuid(), :n, true, :r) RETURNING id"
            ),
            {"n": ATTR_NAME, "r": ROLE},
        ).scalar()
    else:
        conn.execute(
            sa.text("UPDATE attributes SET is_system = true, system_role = :r WHERE id = :i"),
            {"r": ROLE, "i": attr_id},
        )

    # 2. seed the three defaults (skip ones already present)
    for label in LEGACY.values():
        conn.execute(
            sa.text("""
                INSERT INTO attribute_values (id, attribute_id, value)
                SELECT gen_random_uuid(), :attr_id, :v
                WHERE NOT EXISTS (
                    SELECT 1 FROM attribute_values
                    WHERE attribute_id = :attr_id AND value = :v
                )
            """),
            {"attr_id": attr_id, "v": label},
        )

    # 3. legacy enum key -> display label
    for key, label in LEGACY.items():
        conn.execute(
            sa.text("UPDATE sample_requests SET category = :label WHERE category = :key"),
            {"label": label, "key": key},
        )
    conn.execute(
        sa.text("UPDATE sample_requests SET category = :d WHERE category IS NULL OR btrim(category) = ''"),
        {"d": "New Sample"},
    )

    # 4. link rows to their value (unknown free text stays unlinked — the snapshot
    #    still renders, and the user can curate it into a value later)
    conn.execute(
        sa.text("""
            UPDATE sample_requests s
            SET category_value_id = av.id
            FROM attribute_values av
            WHERE av.attribute_id = :attr_id
              AND av.value = btrim(s.category)
              AND s.category_value_id IS NULL
        """),
        {"attr_id": attr_id},
    )


def downgrade() -> None:
    conn = op.get_bind()
    for key, label in LEGACY.items():
        conn.execute(
            sa.text("UPDATE sample_requests SET category = :key WHERE category = :label"),
            {"key": key, "label": label},
        )
    # anything the user authored beyond the three defaults cannot round-trip
    conn.execute(
        sa.text("UPDATE sample_requests SET category = 'NEW_SAMPLE' WHERE category NOT IN :keys")
        .bindparams(sa.bindparam("keys", list(LEGACY.keys()), expanding=True))
    )
    op.drop_index('ix_sample_requests_category_value_id', table_name='sample_requests')
    op.drop_constraint("fk_sample_requests_category_value_id", 'sample_requests', type_="foreignkey")
    op.drop_column('sample_requests', 'category_value_id')
    op.alter_column(
        'sample_requests', 'category',
        existing_type=sa.String(64), type_=sa.String(16),
        existing_nullable=False, server_default='NEW_SAMPLE',
    )
    # the seeded attribute + values are left in place — dropping them would destroy
    # master data a user may have since curated.
