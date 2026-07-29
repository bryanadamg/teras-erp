"""backfill Color.variant_attribute_value_id + customer_id on lab-dip-minted shades

Data-only migration. Approving a lab dip variant mints a Color library row; until now
that row carried neither the `Colors` variant the shade was dipped for nor the request's
customer, so the Color Codes table showed "—" / "House". Approval now stamps both
(api/lab_dips.py); this backfills the shades minted before that.

Same resolution rule as the runtime path:
  * customer  — the lab dip request's customer.
  * variant   — the dip's `color_name` is a `Colors` (system_role='color') attribute
                value. The item's own dips win; otherwise the request-level picks (which
                apply to every item). Linked only when the request resolves to exactly
                one variant — a multi-color request is ambiguous and stays unlinked.

Only NULL columns are written, so a manual edit is never clobbered and a re-run is a
no-op. Manually created colors (no approved_color_id pointing at them) are untouched.

Revision ID: c3e5a7b9d1f4
Revises: a5c7e9b1d3f4
Create Date: 2026-07-29
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3e5a7b9d1f4'
down_revision: Union[str, None] = 'a5c7e9b1d3f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


BACKFILL_CUSTOMER = sa.text("""
    UPDATE colors c
    SET customer_id = r.customer_id
    FROM lab_dip_items i
    JOIN lab_dip_requests r ON r.id = i.lab_dip_request_id
    WHERE i.approved_color_id = c.id
      AND c.customer_id IS NULL
      AND r.customer_id IS NOT NULL
""")


BACKFILL_VARIANT = sa.text("""
    WITH dip AS (
        SELECT i.approved_color_id AS color_id,
               btrim(l.color_name)  AS color_name,
               (l.lab_dip_item_id IS NOT NULL AND l.lab_dip_item_id = i.id) AS own_dip
        FROM lab_dip_items i
        JOIN lab_dip_lines l ON l.lab_dip_request_id = i.lab_dip_request_id
        WHERE i.approved_color_id IS NOT NULL
          AND l.color_name IS NOT NULL
          AND btrim(l.color_name) <> ''
          -- the item's own dips, plus the request-level picks that apply to every item
          AND (l.lab_dip_item_id = i.id OR l.lab_dip_item_id IS NULL)
    ),
    scoped AS (
        SELECT d.color_id, d.color_name
        FROM dip d
        WHERE d.own_dip
           OR NOT EXISTS (SELECT 1 FROM dip x WHERE x.color_id = d.color_id AND x.own_dip)
    ),
    matched AS (
        SELECT DISTINCT s.color_id, av.id AS value_id
        FROM scoped s
        JOIN attribute_values av ON av.value = s.color_name
        JOIN attributes a ON a.id = av.attribute_id AND a.system_role = 'color'
    ),
    resolved AS (
        -- exactly one variant, else ambiguous → leave unlinked for a manual pick.
        -- array_agg[1], not min(): uuid has no min/max aggregate in Postgres.
        SELECT color_id, (array_agg(value_id))[1] AS value_id
        FROM matched
        GROUP BY color_id
        HAVING count(*) = 1
    )
    UPDATE colors c
    SET variant_attribute_value_id = r.value_id
    FROM resolved r
    WHERE r.color_id = c.id
      AND c.variant_attribute_value_id IS NULL
""")


def upgrade() -> None:
    bind = op.get_bind()
    customers = bind.execute(BACKFILL_CUSTOMER).rowcount
    variants = bind.execute(BACKFILL_VARIANT).rowcount
    print(f"backfill: {customers} color(s) linked to a customer, {variants} to a color variant")


def downgrade() -> None:
    # Data-only: a backfilled value is indistinguishable from a user-set one, so
    # clearing them on downgrade would destroy manual edits. Intentional no-op.
    pass
