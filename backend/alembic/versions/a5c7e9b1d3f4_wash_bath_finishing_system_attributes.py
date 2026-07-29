"""wash bath + finishing step become system attribute values

Bak Cuci / Finishing rows on a dye recipe used to be free-text strings. They now
point at AttributeValue rows of two new system attributes ("Wash Bath" /
"Finishing Step"), with `description` kept as a snapshot of the picked text.

Upgrade harvests the distinct legacy descriptions into attribute values so
existing recipes stay linked and the dropdowns start pre-populated with the
real shop-floor wording.

Revision ID: a5c7e9b1d3f4
Revises: 31be263f5cdb
Create Date: 2026-07-29
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'a5c7e9b1d3f4'
down_revision: Union[str, None] = '31be263f5cdb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SPECS = [
    # (table, attribute name, system_role, max harvest length)
    ("dye_recipe_wash_baths", "Wash Bath", "wash_bath", 255),
    ("dye_recipe_finishing", "Finishing Step", "finishing_step", 255),
]


def upgrade() -> None:
    for table, _attr_name, _role, _maxlen in SPECS:
        op.add_column(table, sa.Column('attribute_value_id', postgresql.UUID(as_uuid=True), nullable=True))
        op.create_foreign_key(
            f"fk_{table}_attribute_value_id", table, "attribute_values",
            ["attribute_value_id"], ["id"], ondelete="SET NULL",
        )
        op.create_index(f"ix_{table}_attribute_value_id", table, ["attribute_value_id"])

    conn = op.get_bind()
    for table, attr_name, role, maxlen in SPECS:
        # 1. ensure the system attribute exists (init_db seeds it too; idempotent here
        #    so the harvest below can run on the very first upgrade)
        attr_id = conn.execute(
            sa.text("SELECT id FROM attributes WHERE name = :n OR system_role = :r LIMIT 1"),
            {"n": attr_name, "r": role},
        ).scalar()
        if not attr_id:
            attr_id = conn.execute(
                sa.text(
                    "INSERT INTO attributes (id, name, is_system, system_role) "
                    "VALUES (gen_random_uuid(), :n, true, :r) RETURNING id"
                ),
                {"n": attr_name, "r": role},
            ).scalar()
        else:
            conn.execute(
                sa.text("UPDATE attributes SET is_system = true, system_role = :r WHERE id = :i"),
                {"r": role, "i": attr_id},
            )

        # 2. harvest distinct legacy descriptions into values (skip ones already present)
        conn.execute(
            sa.text(f"""
                INSERT INTO attribute_values (id, attribute_id, value)
                SELECT gen_random_uuid(), :attr_id, d.txt
                FROM (
                    SELECT DISTINCT left(btrim(description), :maxlen) AS txt
                    FROM {table}
                    WHERE description IS NOT NULL AND btrim(description) <> ''
                ) d
                WHERE NOT EXISTS (
                    SELECT 1 FROM attribute_values av
                    WHERE av.attribute_id = :attr_id AND av.value = d.txt
                )
            """),
            {"attr_id": attr_id, "maxlen": maxlen},
        )

        # 3. link the rows to their harvested value
        conn.execute(
            sa.text(f"""
                UPDATE {table} t
                SET attribute_value_id = av.id
                FROM attribute_values av
                WHERE av.attribute_id = :attr_id
                  AND av.value = left(btrim(t.description), :maxlen)
                  AND t.attribute_value_id IS NULL
            """),
            {"attr_id": attr_id, "maxlen": maxlen},
        )


def downgrade() -> None:
    for table, _attr_name, _role, _maxlen in SPECS:
        op.drop_index(f"ix_{table}_attribute_value_id", table_name=table)
        op.drop_constraint(f"fk_{table}_attribute_value_id", table, type_="foreignkey")
        op.drop_column(table, 'attribute_value_id')
    # harvested attribute values / attributes are left in place on downgrade —
    # dropping them would destroy master data a user may have since curated.
