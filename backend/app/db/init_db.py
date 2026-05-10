import logging
from pathlib import Path
from sqlalchemy import text
from app.db.base import Base  # noqa: F401 — triggers all model registrations before individual imports
from app.models.category import Category
from app.models.auth import Permission, Role, User
from app.models.uom import UOM
from app.core.security import get_password_hash
from app.models.stock_ledger import StockLedger
from app.models.stock_balance import StockBalance
from app.models.attribute import AttributeValue
from app.services import stock_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def ensure_static_dirs():
    """Ensure required static directories exist."""
    try:
        for subdir in ("static/logos", "static/samples", "static/boms"):
            p = Path(subdir)
            if not p.exists():
                p.mkdir(parents=True, exist_ok=True)
                logger.info(f"Created directory: {p}")
    except Exception as e:
        logger.warning(f"Static directory creation skipped: {e}")


def seed_sizes(db):
    try:
        from app.models.size import Size
        if db.query(Size).count() == 0:
            sizes = [("S", 1), ("M", 2), ("L", 3), ("XL", 4), ("2XL", 5), ("3XL", 6), ("4XL", 7)]
            for name, order in sizes:
                db.add(Size(name=name, sort_order=order))
            db.commit()
            logger.info("Seeded sizes S–4XL")
    except Exception as e:
        logger.warning(f"Size seeding skipped: {e}")


def seed_colors_attribute(db):
    try:
        from app.models.attribute import Attribute
        existing = db.query(Attribute).filter(Attribute.name == "Colors").first()
        if not existing:
            db.add(Attribute(name="Colors", is_system=True))
            db.commit()
            logger.info("Seeded 'Colors' attribute")
        elif not existing.is_system:
            existing.is_system = True
            db.commit()
            logger.info("Marked existing 'Colors' attribute as system")
    except Exception as e:
        logger.warning(f"Colors attribute seeding skipped: {e}")


def seed_categories(db):
    try:
        if db.query(Category).count() == 0:
            defaults = ["Raw Material", "WIP", "Finished Goods", "Sample", "Consumable"]
            for name in defaults:
                db.add(Category(name=name))
            db.commit()
            logger.info("Seeded default categories")
    except Exception as e:
        logger.warning(f"Category seeding skipped: {e}")


def seed_uoms(db):
    try:
        if db.query(UOM).count() == 0:
            system_uoms = {"Roll", "Pic"}
            defaults = ["Pcs", "Roll", "Pic", "Cone", "Bal", "Box", "Set", "kg", "m", "l"]
            for name in defaults:
                db.add(UOM(name=name, is_system=(name in system_uoms)))
            db.commit()
            logger.info("Seeded default UOMs")
    except Exception as e:
        logger.warning(f"UOM seeding skipped: {e}")


def seed_rbac(db):
    try:
        perms_data = [
            ("inventory.manage", "Manage Items, Attributes, Categories"),
            ("inventory.delete", "Delete Inventory Data"),
            ("locations.manage", "Manage Locations"),
            ("manufacturing.manage", "Manage BOMs and Routing"),
            ("work_order.manage", "Create and Update Work Orders"),
            ("stock.entry", "Record Stock Movements"),
            ("reports.view", "View Reports"),
            ("admin.access", "Full System Access"),
        ]

        db_perms = {}
        for code, desc in perms_data:
            perm = db.query(Permission).filter(Permission.code == code).first()
            if not perm:
                perm = Permission(code=code, description=desc)
                db.add(perm)
                db.commit()
                db.refresh(perm)
            db_perms[code] = perm

        roles_data = {
            "Administrator": ["admin.access", "inventory.manage", "inventory.delete", "locations.manage", "manufacturing.manage", "work_order.manage", "stock.entry", "reports.view"],
            "Store Manager": ["inventory.manage", "stock.entry", "reports.view"],
            "Production Manager": ["manufacturing.manage", "work_order.manage", "reports.view"],
            "Operator": ["work_order.manage"],
        }

        for role_name, perm_codes in roles_data.items():
            role = db.query(Role).filter(Role.name == role_name).first()
            if not role:
                role = Role(name=role_name)
                db.add(role)
                db.commit()
                db.refresh(role)
            current_perms = role.permissions
            for code in perm_codes:
                if db_perms[code] not in current_perms:
                    role.permissions.append(db_perms[code])
            db.commit()

        users_data = [
            ("admin", "System Admin", "Administrator"),
            ("store_mgr", "Budi Store", "Store Manager"),
            ("prod_mgr", "Siti Production", "Production Manager"),
            ("operator", "Joko Worker", "Operator"),
        ]
        for uname, fname, rname in users_data:
            user = db.query(User).filter(User.username == uname).first()
            if not user:
                role = db.query(Role).filter(Role.name == rname).first()
                db.add(User(
                    username=uname,
                    full_name=fname,
                    role_id=role.id,
                    hashed_password=get_password_hash("password"),
                ))
                db.commit()

        logger.info("Seeded RBAC (Roles, Permissions, Users)")
    except Exception as e:
        logger.error(f"RBAC seeding failed: {e}")


def sync_stock_balances(db):
    """Rebuild stock_balances from stock_ledger. Runs on every startup."""
    try:
        logger.info("Synchronizing Stock Balances from Ledger...")
        db.execute(text("TRUNCATE stock_balances, stock_balance_values CASCADE"))
        db.commit()

        entries = db.query(StockLedger).all()
        aggregated = {}

        for e in entries:
            attr_ids = [str(v.id) for v in e.attribute_values]
            v_key = stock_service._generate_variant_key(attr_ids)
            b_key = str(e.batch_id) if e.batch_id else ""
            s_key = f"{str(e.item_id)}:{str(e.location_id)}:{v_key}:{b_key}"

            if s_key not in aggregated:
                aggregated[s_key] = {
                    "qty": 0.0,
                    "attr_ids": attr_ids,
                    "item_id": e.item_id,
                    "location_id": e.location_id,
                    "v_key": v_key,
                    "b_key": b_key,
                }
            aggregated[s_key]["qty"] += float(e.qty_change)

        logger.info(f"Aggregated {len(entries)} ledger entries into {len(aggregated)} unique balance records.")

        for s_key, data in aggregated.items():
            balance = StockBalance(
                item_id=data["item_id"],
                location_id=data["location_id"],
                variant_key=data["v_key"],
                batch_key=data["b_key"],
                qty=data["qty"],
            )
            if data["attr_ids"]:
                vals = db.query(AttributeValue).filter(AttributeValue.id.in_(data["attr_ids"])).all()
                balance.attribute_values = vals
            db.add(balance)

        db.commit()
        logger.info("Stock synchronization successfully committed.")
    except Exception as e:
        logger.error(f"Stock synchronization failed: {e}")
        db.rollback()


def init_db() -> None:
    logger.info("Initializing Database...")
    ensure_static_dirs()

    from app.db.session import SessionLocal
    db = SessionLocal()
    try:
        seed_categories(db)
        seed_uoms(db)
        seed_rbac(db)
        seed_colors_attribute(db)
        seed_sizes(db)
        sync_stock_balances(db)
    finally:
        db.close()

    logger.info("Database initialization complete.")


if __name__ == "__main__":
    init_db()
