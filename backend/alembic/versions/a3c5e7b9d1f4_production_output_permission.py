"""dedicated Production Output report permission

The Production Output report (`/reports/machine-output`, `/reports/packing-output`)
was gated by the broad `reports.view`, which also fronts the dashboard — so a role
could not be given one without the other, and shop-floor output/reject numbers had
no access control of their own on the Permissions tab.

Adds `production_output.view` / `production_output.export` (Platform section) and
backfills them onto every Role and direct User grant that currently holds
`reports.view`, so nothing loses the report when the routes flip to the new codes.
`reports.view` itself is left in place — the dashboard still checks it.

Revision ID: a3c5e7b9d1f4
Revises: d7f9b1c3e5a8
"""
import uuid
from alembic import op
import sqlalchemy as sa

revision = 'a3c5e7b9d1f4'
down_revision = 'd7f9b1c3e5a8'
branch_labels = None
depends_on = None

NEW_PERMISSIONS = [
    ("production_output.view", "View Production Output Report"),
    ("production_output.export", "Export Production Output CSV"),
]

NEW_CODES = [c for c, _ in NEW_PERMISSIONS]


def upgrade():
    conn = op.get_bind()

    for code, description in NEW_PERMISSIONS:
        exists = conn.execute(sa.text("SELECT 1 FROM permissions WHERE code = :code"), {"code": code}).first()
        if exists:
            continue
        conn.execute(
            sa.text("INSERT INTO permissions (id, code, description) VALUES (:id, :code, :description)"),
            {"id": str(uuid.uuid4()), "code": code, "description": description},
        )

    conn.execute(
        sa.text("""
            INSERT INTO role_permissions (role_id, permission_id)
            SELECT DISTINCT rp.role_id, np.id
              FROM role_permissions rp
              JOIN permissions op ON op.id = rp.permission_id AND op.code = 'reports.view'
              JOIN permissions np ON np.code = ANY(:new_codes)
             ON CONFLICT DO NOTHING
        """),
        {"new_codes": NEW_CODES},
    )

    conn.execute(
        sa.text("""
            INSERT INTO user_permissions (user_id, permission_id)
            SELECT DISTINCT up.user_id, np.id
              FROM user_permissions up
              JOIN permissions op ON op.id = up.permission_id AND op.code = 'reports.view'
              JOIN permissions np ON np.code = ANY(:new_codes)
             ON CONFLICT DO NOTHING
        """),
        {"new_codes": NEW_CODES},
    )


def downgrade():
    # Grants and permission rows are left in place: they are inert once the routes
    # check `reports.view` again, and deleting them would strand any grant an admin
    # made on the Permissions tab after upgrade.
    pass
