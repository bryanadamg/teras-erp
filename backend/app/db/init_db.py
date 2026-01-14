import logging
from sqlalchemy import text
from app.db.session import engine
from app.db.base import Base

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def run_migrations():
    """
    Run ad-hoc migrations to fix schema discrepancies.
    This is a simple alternative to Alembic for this dev setup.
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("COMMIT")) # Ensure clean state
            
            # 1. Add variant_id to stock_ledger if it doesn't exist
            try:
                conn.execute(text("ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES variants(id)"))
                conn.execute(text("COMMIT"))
                logger.info("Migration: Verified variant_id in stock_ledger")
            except Exception as e:
                logger.warning(f"Migration step 1 warning: {e}")

            # 2. Drop legacy 'variant' column from items
            try:
                conn.execute(text("ALTER TABLE items DROP COLUMN IF EXISTS variant"))
                conn.execute(text("COMMIT"))
                logger.info("Migration: Verified cleanup of items table")
            except Exception as e:
                logger.warning(f"Migration step 2 warning: {e}")

            # 3. Add category column to items if it doesn't exist
            try:
                conn.execute(text("ALTER TABLE items ADD COLUMN IF NOT EXISTS category VARCHAR(64)"))
                conn.execute(text("COMMIT"))
                logger.info("Migration: Verified category column in items")
            except Exception as e:
                logger.warning(f"Migration step 3 warning: {e}")

            # 4. Add location_id to work_orders
            try:
                conn.execute(text("ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id)"))
                conn.execute(text("COMMIT"))
                logger.info("Migration: Verified location_id in work_orders")
            except Exception as e:
                logger.warning(f"Migration step 4 warning: {e}")

            # 5. Add source_sample_id to items
            try:
                conn.execute(text("ALTER TABLE items ADD COLUMN IF NOT EXISTS source_sample_id UUID REFERENCES items(id)"))
                conn.execute(text("COMMIT"))
                logger.info("Migration: Verified source_sample_id in items")
            except Exception as e:
                logger.warning(f"Migration step 5 warning: {e}")

            # 6. Add attribute_id to items
            try:
                conn.execute(text("ALTER TABLE items ADD COLUMN IF NOT EXISTS attribute_id UUID REFERENCES attributes(id)"))
                conn.execute(text("COMMIT"))
                logger.info("Migration: Verified attribute_id in items")
            except Exception as e:
                logger.warning(f"Migration step 6 warning: {e}")

            # 7. Rename variant_id to attribute_value_id in multiple tables
            for table in ["stock_ledger", "boms", "bom_lines", "work_orders"]:
                try:
                    # Check if old column exists and new one doesn't
                    conn.execute(text(f"ALTER TABLE {table} RENAME COLUMN variant_id TO attribute_value_id"))
                    conn.execute(text(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {table}_variant_id_fkey"))
                    conn.execute(text(f"ALTER TABLE {table} ADD CONSTRAINT {table}_attribute_value_id_fkey FOREIGN KEY (attribute_value_id) REFERENCES attribute_values(id)"))
                    conn.execute(text("COMMIT"))
                    logger.info(f"Migration: Renamed variant_id in {table}")
                except Exception as e:
                    # If already renamed or error, just try to add column if it doesn't exist
                    try:
                        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS attribute_value_id UUID REFERENCES attribute_values(id)"))
                        conn.execute(text("COMMIT"))
                    except: pass

    except Exception as e:
        logger.error(f"Migration failed: {e}")

from app.models.category import Category

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

def init_db() -> None:
    logger.info("Creating initial data")
    Base.metadata.create_all(bind=engine)
    run_migrations()
    
    # Seed data
    from app.db.session import SessionLocal
    db = SessionLocal()
    try:
        seed_categories(db)
    finally:
        db.close()
        
    logger.info("Initial data created")

if __name__ == "__main__":
    init_db()
