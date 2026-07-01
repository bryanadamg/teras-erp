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
        for subdir in ("static/logos", "static/samples", "static/boms", "static/receipts"):
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


def seed_system_attributes(db):
    try:
        from app.models.attribute import Attribute, AttributeValue
        # (name, role, seed_values) — seed_values=None means no value seeding
        system_attrs = [
            ("Colors", "color", None),
            ("Combo", "combo", None),
            ("Materials", "material", ["Polyester", "Nylon", "Cotton", "Latex", "Spandex"]),
            ("Color Code", "labdip_color", None),
        ]
        for name, role, seed_values in system_attrs:
            existing = db.query(Attribute).filter(Attribute.name == name).first()
            if not existing:
                existing = Attribute(name=name, is_system=True, system_role=role)
                db.add(existing)
                db.commit()
                db.refresh(existing)
                logger.info(f"Seeded '{name}' system attribute (role={role})")
            else:
                changed = False
                if not existing.is_system:
                    existing.is_system = True
                    changed = True
                if existing.system_role != role:
                    existing.system_role = role
                    changed = True
                if changed:
                    db.commit()
                    logger.info(f"Updated '{name}' attribute: is_system=True, system_role={role}")
            # Seed default values only when the attribute has none yet
            if seed_values:
                have = db.query(AttributeValue).filter(AttributeValue.attribute_id == existing.id).count()
                if have == 0:
                    for v in seed_values:
                        db.add(AttributeValue(attribute_id=existing.id, value=v))
                    db.commit()
                    logger.info(f"Seeded {len(seed_values)} default values for '{name}'")
    except Exception as e:
        logger.warning(f"System attribute seeding skipped: {e}")


SYSTEM_CATEGORIES = {"Raw Material", "Finished Goods", "WIP", "Sample", "Chemical", "Dye"}

# (parent_name, child_name) — both marked is_system=True
SYSTEM_CHILD_CATEGORIES = [
    ("WIP", "Beam"),
]

def seed_categories(db):
    try:
        defaults = ["Raw Material", "WIP", "Finished Goods", "Sample", "Consumable", "Chemical", "Dye"]
        updated = 0
        created = 0
        for name in defaults:
            cat = db.query(Category).filter_by(name=name, parent_id=None).first()
            if cat:
                if name in SYSTEM_CATEGORIES and not cat.is_system:
                    cat.is_system = True
                    updated += 1
            else:
                db.add(Category(name=name, is_system=(name in SYSTEM_CATEGORIES)))
                created += 1
        if updated or created:
            db.commit()
        if created:
            logger.info(f"Seeded {created} missing default categories")
        if updated:
            logger.info(f"Backfilled is_system=True for {updated} system categories")

        # Seed system child categories
        for parent_name, child_name in SYSTEM_CHILD_CATEGORIES:
            parent = db.query(Category).filter_by(name=parent_name, parent_id=None).first()
            if not parent:
                continue
            child = db.query(Category).filter_by(name=child_name, parent_id=parent.id).first()
            if child:
                if not child.is_system:
                    child.is_system = True
                    db.commit()
                    logger.info(f"Backfilled is_system=True for child category '{child_name}'")
            else:
                db.add(Category(name=child_name, parent_id=parent.id, is_system=True))
                db.commit()
                logger.info(f"Seeded system child category '{parent_name} > {child_name}'")
    except Exception as e:
        logger.warning(f"Category seeding skipped: {e}")


def seed_uoms(db):
    try:
        system_uoms = {"kg", "yard"}
        if db.query(UOM).count() == 0:
            defaults = ["Pcs", "Cone", "Bal", "Box", "Set", "m", "l", "kg", "yard"]
            for name in defaults:
                db.add(UOM(name=name, is_system=(name in system_uoms)))
            db.commit()
            logger.info("Seeded default UOMs")
        else:
            # Ensure kg and yard exist and are marked system
            for name in system_uoms:
                existing = db.query(UOM).filter(UOM.name == name).first()
                if existing:
                    if not existing.is_system:
                        existing.is_system = True
                else:
                    db.add(UOM(name=name, is_system=True))
            db.commit()
    except Exception as e:
        logger.warning(f"UOM seeding skipped: {e}")


def seed_operations(db):
    try:
        from app.models.routing import Operation
        system_ops = [
            {"code": "BEAMING",   "name": "Beaming",   "description": "Yarn beaming process"},
            {"code": "WARPING",   "name": "Warping",   "description": "Yarn warping onto beam"},
            {"code": "WEAVING",   "name": "Weaving",   "description": "Fabric weaving on loom"},
            {"code": "DYEING",    "name": "Dyeing",    "description": "Fabric dyeing process"},
            {"code": "SETTING",   "name": "Setting",   "description": "Heat setting after dyeing"},
            {"code": "FINISHING", "name": "Finishing", "description": "Final finishing and quality check"},
        ]
        for op_data in system_ops:
            existing = db.query(Operation).filter(Operation.code == op_data["code"]).first()
            if existing:
                existing.is_system = True
            else:
                db.add(Operation(**op_data, is_system=True))
        db.commit()
        logger.info("Seeded system operations")
    except Exception as e:
        logger.warning(f"Operation seeding skipped: {e}")


SYSTEM_WAREHOUSES = [
    {"code": "RM",       "name": "Raw Material Store",   "system_code": "RM"},
    {"code": "CHEM",     "name": "Chemical Store",        "system_code": "CHEM"},
    {"code": "WIP",      "name": "WIP Store",             "system_code": "WIP"},
    {"code": "FG",       "name": "Finished Goods Store",  "system_code": "FG"},
    {"code": "QC",       "name": "Quarantine",            "system_code": "QC"},
    {"code": "DISPATCH", "name": "Dispatch Staging",      "system_code": "DISPATCH"},
    {"code": "SPARE",    "name": "Spare Parts Store",     "system_code": "SPARE"},
    {"code": "GREIGE",   "name": "Greige Store",          "system_code": "GREIGE"},
    {"code": "MIX",      "name": "Mix Store",             "system_code": "MIX"},
]


def seed_system_locations(db):
    try:
        from app.models.location import Location
        created = 0
        for w in SYSTEM_WAREHOUSES:
            existing = db.query(Location).filter(Location.system_code == w["system_code"]).first()
            if existing:
                continue
            # Adopt an existing row with the same code rather than creating a duplicate
            by_code = db.query(Location).filter(Location.code == w["code"]).first()
            if by_code:
                by_code.system_code = w["system_code"]
                by_code.location_type = 'warehouse'
                db.commit()
            else:
                db.add(Location(
                    code=w["code"],
                    name=w["name"],
                    location_type='warehouse',
                    system_code=w["system_code"],
                    parent_id=None,
                ))
                db.commit()
                created += 1
        if created:
            logger.info(f"Seeded {created} system warehouse locations")
    except Exception as e:
        logger.warning(f"System location seeding skipped: {e}")


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


def backfill_mo_planned_components(db):
    """One-time backfill for MOs created before the BOM snapshot feature.
    Idempotent — skips MOs that already have planned_component rows."""
    try:
        db.execute(text("""
            INSERT INTO mo_planned_components
                (id, mo_id, item_id, percentage, qty, source_location_id, bom_line_id, attribute_value_ids)
            SELECT
                gen_random_uuid(),
                mo.id,
                bl.item_id,
                bl.percentage,
                bl.qty,
                bl.source_location_id,
                bl.id,
                COALESCE(
                    (SELECT jsonb_agg(blv.attribute_value_id::text ORDER BY blv.attribute_value_id::text)
                     FROM bom_line_values blv WHERE blv.bom_line_id = bl.id),
                    '[]'::jsonb
                )
            FROM manufacturing_orders mo
            JOIN bom_lines bl ON bl.bom_id = mo.bom_id
            WHERE mo.bom_id IS NOT NULL
              AND mo.id NOT IN (SELECT DISTINCT mo_id FROM mo_planned_components)
        """))
        db.commit()
        logger.info("mo_planned_components backfill check complete")
    except Exception as e:
        db.rollback()
        logger.warning(f"mo_planned_components backfill failed: {e}")


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
                    "cones": 0,
                    "boxes": 0,
                    "drums": 0,
                    "attr_ids": attr_ids,
                    "item_id": e.item_id,
                    "location_id": e.location_id,
                    "v_key": v_key,
                    "b_key": b_key,
                }
            aggregated[s_key]["qty"] += float(e.qty_change)
            aggregated[s_key]["cones"] += int(e.qty_cones_change or 0)
            aggregated[s_key]["boxes"] += int(e.qty_boxes_change or 0)
            aggregated[s_key]["drums"] += int(e.qty_drums_change or 0)

        logger.info(f"Aggregated {len(entries)} ledger entries into {len(aggregated)} unique balance records.")

        for s_key, data in aggregated.items():
            balance = StockBalance(
                item_id=data["item_id"],
                location_id=data["location_id"],
                variant_key=data["v_key"],
                batch_key=data["b_key"],
                qty=data["qty"],
                qty_cones=data["cones"],
                qty_boxes=data["boxes"],
                qty_drums=data["drums"],
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
        seed_operations(db)
        seed_rbac(db)
        seed_system_attributes(db)
        seed_sizes(db)
        seed_system_locations(db)
        backfill_mo_planned_components(db)
        sync_stock_balances(db)
    finally:
        db.close()

    logger.info("Database initialization complete.")


if __name__ == "__main__":
    init_db()
